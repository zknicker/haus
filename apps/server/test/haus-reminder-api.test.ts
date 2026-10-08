import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { scheduleReminder, tickReminders } from '../src/reminders/reminders.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let admin: HausClient;
let agentId: string;
let anchorMessageId: string;
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let member: HausClient;
let outsider: HausClient;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await signIn('user_reminder_api_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder API Server',
        slug: 'reminder-api-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Reminder API anchor',
        nonce: 'reminder-api-anchor',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    agentId = 'agt_reminder_api';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'reminder-cove', 'Cove', 'America/New_York')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${agentId})
    `;
    admin = await addHuman('user_reminder_api_admin', 'admin');
    member = await addHuman('user_reminder_api_member', 'member');
    outsider = await signIn('user_reminder_api_outsider');
    await outsider.trpc.server.create.mutate({
        displayName: 'Outsider Server',
        slug: 'reminder-api-outsider',
    });
});

afterAll(async () => {
    owner?.close();
    admin?.close();
    member?.close();
    outsider?.close();
    await connection?.close();
    await harness?.close();
});

describe('reminder operator API', () => {
    test('allows only Owner and Admin to list Server state and fire logs', async () => {
        const reminder = await schedule('operator-visible', 'Operator visible');
        await tickReminders(connection.db, {
            now: () => new Date('2026-07-27T15:00:00.000Z'),
        });

        await expect(
            owner.trpc.reminder.list.query({ agentId, serverId, status: 'scheduled' })
        ).resolves.toContainEqual(
            expect.objectContaining({ id: reminder.reminder.id, ownerHandle: 'reminder-cove' })
        );
        await expect(
            admin.trpc.reminder.runs.query({
                reminderId: reminder.reminder.id,
                serverId,
            })
        ).resolves.toEqual([
            expect.objectContaining({
                reminderId: reminder.reminder.id,
                scheduledFor: '2026-07-27T14:00:00.000Z',
            }),
        ]);
        const durableEvents = await owner.trpc.chat.events.query({
            afterCursor: '0',
            serverId,
        });
        const reminderEvents = durableEvents.filter(
            (event) =>
                event.type === 'reminder.changed' && event.reminderId === reminder.reminder.id
        );
        expect(reminderEvents.map((event) => event.action)).toEqual(['scheduled', 'fired']);
        // Neither scheduling nor firing writes a Chat message any more, so no
        // `message.created` rides alongside a `reminder.changed`.
        const firstReminderIndex = durableEvents.findIndex(
            (event) => event.id === reminderEvents[0]?.id
        );
        expect(
            durableEvents
                .slice(firstReminderIndex)
                .filter((event) => event.type === 'message.created')
        ).toEqual([]);
        await expect(member.trpc.reminder.list.query({ serverId })).rejects.toThrow(
            /Owner or Admin/i
        );
        await expect(outsider.trpc.reminder.list.query({ serverId })).rejects.toThrow(/member/i);
    });

    test('persists cancellation events for live delivery and reconnect catch-up', async () => {
        const reminder = await schedule('operator-cancel', 'Operator cancel');
        const subscription = subscribeToReminderEvents(admin, serverId);
        await subscription.started;
        const canceled = await admin.trpc.reminder.cancel.mutate({
            commandId: 'operator-cancel-command',
            expectedVersion: 1,
            reminderId: reminder.reminder.id,
            serverId,
        });
        const retried = await admin.trpc.reminder.cancel.mutate({
            commandId: 'operator-cancel-command',
            expectedVersion: 1,
            reminderId: reminder.reminder.id,
            serverId,
        });

        expect(canceled.reminder.status).toBe('canceled');
        expect(retried).toEqual({ ...canceled, idempotent: true });
        await expect(subscription.nextEvent).resolves.toMatchObject({
            action: 'canceled',
            reminderId: reminder.reminder.id,
            type: 'reminder.changed',
        });
        await expect(
            owner.trpc.reminder.changes.query({ afterCursor: '0', serverId })
        ).resolves.toContainEqual(
            expect.objectContaining({
                action: 'canceled',
                reminderId: reminder.reminder.id,
            })
        );
        await expect(
            member.trpc.reminder.cancel.mutate({
                commandId: 'member-cancel',
                expectedVersion: 2,
                reminderId: reminder.reminder.id,
                serverId,
            })
        ).rejects.toThrow(/Owner or Admin/i);
        await expect(
            owner.trpc.reminder.cancel.mutate({
                commandId: 'operator-second-cancel',
                expectedVersion: 2,
                reminderId: reminder.reminder.id,
                serverId,
            })
        ).rejects.toThrow(/already canceled/i);
    });

    test('serializes concurrent retries of an operator cancellation', async () => {
        const reminder = await schedule('operator-concurrent-cancel', 'Concurrent cancel');
        const input = {
            commandId: 'operator-concurrent-cancel-command',
            expectedVersion: 1,
            reminderId: reminder.reminder.id,
            serverId,
        };

        const results = await Promise.all([
            owner.trpc.reminder.cancel.mutate(input),
            owner.trpc.reminder.cancel.mutate(input),
        ]);

        expect(results.map((result) => result.idempotent).sort()).toEqual([false, true]);
        expect(results[0]?.reminder).toEqual(results[1]?.reminder);
    });

    test('an operator cancellation queued behind removal reauthorizes before writing', async () => {
        const departingAdmin = await addHuman('user_reminder_api_race', 'admin');
        const [departingUser] = (await harness.sql`
            select id from users where clerk_user_id = 'user_reminder_api_race'
        `) as { id: string }[];
        const reminder = await schedule('operator-removal-race', 'Removal race');
        let removal: Promise<unknown> = Promise.resolve();
        let cancellation: Promise<unknown> = Promise.resolve();

        await whileServerRowIsHeld(async () => {
            removal = owner.trpc.member.remove.mutate({
                confirmation: 'reminder-api-server',
                serverId,
                userId: departingUser.id,
            });
            await Bun.sleep(120);
            cancellation = departingAdmin.trpc.reminder.cancel.mutate({
                commandId: 'operator-removal-race-cancel',
                expectedVersion: reminder.reminder.version,
                reminderId: reminder.reminder.id,
                serverId,
            });
            await Bun.sleep(120);
        });

        await expect(removal).resolves.toMatchObject({ userId: departingUser.id });
        await expect(cancellation).rejects.toThrow(/not a member/i);
        await expect(owner.trpc.reminder.list.query({ serverId })).resolves.toContainEqual(
            expect.objectContaining({ id: reminder.reminder.id, status: 'scheduled' })
        );
        departingAdmin.close();
    });

    test('rechecks persisted operator authority during live delivery', async () => {
        const subscription = subscribeToReminderEvents(admin, serverId);
        await subscription.started;
        const [adminUser] = (await harness.sql`
            select id from users where clerk_user_id = 'user_reminder_api_admin'
        `) as { id: string }[];
        await owner.trpc.member.remove.mutate({
            confirmation: 'reminder-api-server',
            serverId,
            userId: adminUser.id,
        });

        await schedule('operator-revoked', 'Revoked operator event');

        await expect(subscription.nextEvent).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
        });
        await expect(
            admin.trpc.reminder.changes.query({ afterCursor: '0', serverId })
        ).rejects.toThrow(/member/i);
    });

    test('reports live operator role loss as forbidden', async () => {
        const departingAdmin = await addHuman('user_reminder_api_role_loss', 'admin');
        const subscription = subscribeToReminderEvents(departingAdmin, serverId);
        await subscription.started;
        const [departingUser] = (await harness.sql`
            select id from users where clerk_user_id = 'user_reminder_api_role_loss'
        `) as { id: string }[];
        await owner.trpc.member.changeRole.mutate({
            role: 'member',
            serverId,
            userId: departingUser.id,
        });

        await schedule('operator-role-loss', 'Role loss event');

        await expect(subscription.nextEvent).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
        });
        departingAdmin.close();
    });
});

async function schedule(commandId: string, title: string) {
    return scheduleReminder(
        connection.db,
        agentId,
        {
            anchorChatId: chatId,
            anchorMessageId,
            commandId,
            fireAt: new Date('2026-07-27T14:00:00.000Z'),
            repeat: 'every:1d',
            serverId,
            title,
        },
        { now: () => new Date('2026-07-27T12:00:00.000Z') }
    );
}

async function signIn(clerkUserId: string) {
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}

async function addHuman(clerkUserId: string, role: 'admin' | 'member') {
    const client = await signIn(clerkUserId);
    await client.trpc.server.create.mutate({
        displayName: `${clerkUserId} Root`,
        slug: `${clerkUserId.replaceAll('_', '-')}-root`,
    });
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values (${`mem_${clerkUserId}`}, ${serverId}, ${user.id}, ${role})
    `;
    return client;
}

async function whileServerRowIsHeld(run: () => Promise<void>) {
    const holding = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = harness.sql.begin(async (tx: typeof harness.sql) => {
        await tx`select id from servers where id = ${serverId} for update`;
        holding.resolve();
        await release.promise;
    });
    await holding.promise;
    try {
        await run();
    } finally {
        release.resolve();
        await held;
    }
}

function subscribeToReminderEvents(client: HausClient, subscribedServerId: string) {
    const started = Promise.withResolvers<void>();
    const nextEvent = Promise.withResolvers<unknown>();
    const timeout = setTimeout(() => {
        nextEvent.reject(new Error('Timed out waiting for a reminder event.'));
    }, 5000);
    const subscription = client.trpc.reminder.onEvent.subscribe(
        { serverId: subscribedServerId },
        {
            onData: (event) => {
                clearTimeout(timeout);
                subscription.unsubscribe();
                nextEvent.resolve(event);
            },
            onError: (error) => {
                clearTimeout(timeout);
                started.reject(error);
                nextEvent.reject(error);
            },
            onStarted: () => started.resolve(),
        }
    );
    started.promise.catch(() => undefined);
    nextEvent.promise.catch(() => undefined);
    return { nextEvent: nextEvent.promise, started: started.promise };
}
