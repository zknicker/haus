import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    cancelReminder,
    listReminderAgentAttention,
    listReminderFires,
    listReminders,
    ReminderVersionConflictError,
    scheduleReminder,
    snoozeReminder,
    tickReminders,
    updateReminder,
} from '../src/reminders/reminders.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let agentId: string;
let anchorMessageId: string;
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    const token = await harness.clerk.mintSessionToken('user_reminder_owner');
    owner = createHausClient(harness, token);
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder Server',
        slug: 'reminder-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Check deployment health.',
        nonce: 'reminder-anchor',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    agentId = 'agt_reminder_author';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'reminder-cove', 'Cove', 'America/New_York')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${agentId})
    `;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

describe('reminders', () => {
    test('schedules an author-owned reminder once and posts no receipt', async () => {
        const input = {
            anchorChatId: chatId,
            anchorMessageId,
            commandId: 'reminder-command-schedule-1',
            fireAt: new Date('2026-07-27T13:00:00.000Z'),
            repeat: 'daily@09:00',
            script: 'printf "check"',
            serverId,
            timezone: 'America/New_York',
            title: 'Check deployment',
        };

        const created = await scheduleReminder(connection.db, agentId, input, {
            now: () => new Date('2026-07-26T12:00:00.000Z'),
        });
        const retried = await scheduleReminder(connection.db, agentId, input, {
            now: () => new Date('2026-07-26T12:00:00.000Z'),
        });

        expect(created.idempotent).toBe(false);
        expect(retried).toEqual({ ...created, idempotent: true });
        const listed = await listReminders(connection.db, {
            actor: { agentId, kind: 'agent' },
            serverId,
        });
        expect(listed).toEqual([
            expect.objectContaining({
                anchorChatId: chatId,
                anchorMessageId,
                fireAt: input.fireAt.toISOString(),
                hasScript: true,
                id: created.reminder.id,
                ownerAgentId: agentId,
                repeat: 'daily@09:00',
                scriptBytes: 14,
                status: 'scheduled',
                title: 'Check deployment',
            }),
        ]);

        // Scheduling writes nothing to the transcript; the Automations tab and
        // the `reminder.changed` event carry the new Reminder.
        const transcript = await owner.trpc.chat.messages.query({
            chatId,
            limit: 20,
            serverId,
        });
        expect(transcript.messages.at(-1)?.id).toBe(anchorMessageId);
        expect(transcript.messages.filter((message) => message.author.kind === 'system')).toEqual(
            []
        );
    });

    test('replays current schedule state after time and later mutations', async () => {
        const input = {
            anchorChatId: chatId,
            anchorMessageId,
            commandId: 'reminder-command-original-result',
            fireAt: new Date('2027-01-01T15:00:00.000Z'),
            serverId,
            title: 'Original result',
        };
        const created = await scheduleReminder(connection.db, agentId, input, {
            now: () => new Date('2026-07-26T12:00:00.000Z'),
        });
        const updated = await updateReminder(
            connection.db,
            agentId,
            {
                commandId: 'reminder-command-original-result-update',
                expectedVersion: 1,
                reminderId: created.reminder.id,
                serverId,
                title: 'Later state',
            },
            { now: () => new Date('2026-07-26T13:00:00.000Z') }
        );

        const replayed = await scheduleReminder(connection.db, agentId, input, {
            now: () => new Date('2027-02-01T12:00:00.000Z'),
        });

        expect(replayed).toEqual({ ...updated, idempotent: true });
    });

    test('serializes concurrent retries of the same schedule command', async () => {
        const input = {
            anchorChatId: chatId,
            anchorMessageId,
            commandId: 'reminder-command-concurrent-schedule',
            fireAt: new Date('2026-07-27T15:00:00.000Z'),
            serverId,
            title: 'Concurrent schedule retry',
        };

        const results = await Promise.all([
            scheduleReminder(connection.db, agentId, input, {
                now: () => new Date('2026-07-26T12:00:00.000Z'),
            }),
            scheduleReminder(connection.db, agentId, input, {
                now: () => new Date('2026-07-26T12:00:00.000Z'),
            }),
        ]);

        expect(results.map((result) => result.idempotent).sort()).toEqual([false, true]);
        expect(new Set(results.map((result) => result.reminder.id)).size).toBe(1);
    });

    test('rejects an Agent home timezone the reminder would store', async () => {
        const invalidAgentId = 'agt_invalid_timezone';
        await addAgent(invalidAgentId);
        await harness.sql`
            update agents set home_timezone = 'Not/A_Timezone'
            where server_id = ${serverId} and id = ${invalidAgentId}
        `;

        await expect(
            scheduleReminder(
                connection.db,
                invalidAgentId,
                {
                    anchorChatId: chatId,
                    anchorMessageId,
                    commandId: 'invalid-timezone-schedule',
                    fireAt: new Date('2026-07-27T16:00:00.000Z'),
                    repeat: 'every:1d',
                    serverId,
                    title: 'Invalid timezone',
                },
                { now: () => new Date('2026-07-26T12:00:00.000Z') }
            )
        ).rejects.toThrow('valid IANA timezone');
    });

    test('anchors a reminder directly in an authorized Thread and writes no receipt', async () => {
        const reply = await owner.trpc.chat.send.mutate({
            chatId,
            content: 'Thread reminder anchor',
            nonce: 'reminder-thread-anchor',
            serverId,
            thread: { anchorMessageId },
        });
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: reply.message.chatId,
                anchorMessageId: reply.message.id,
                commandId: 'reminder-command-thread-schedule',
                fireAt: new Date('2026-07-26T13:00:00.000Z'),
                serverId,
                title: 'Reply in the Thread',
            },
            { now: () => new Date('2026-07-26T12:00:00.000Z') }
        );

        await tickReminders(connection.db, {
            now: () => new Date('2026-07-26T13:00:00.000Z'),
        });

        const transcript = await owner.trpc.chat.messages.query({
            chatId: reply.message.chatId,
            limit: 20,
            serverId,
        });
        expect(scheduled.reminder).toMatchObject({
            anchorChatId: reply.message.chatId,
            anchorMessageId: reply.message.id,
        });
        // Neither the schedule nor the fire appends a row to the Thread.
        expect(transcript.messages.map((message) => message.id)).toEqual([reply.message.id]);
    });

    test('fires once atomically, advances recurrence from now, and never executes scripts', async () => {
        const canaryPath = join(tmpdir(), `haus-server-script-canary-${crypto.randomUUID()}`);
        const script = `touch ${canaryPath}`;
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-fire-1',
                repeat: 'daily@09:00',
                script,
                serverId,
                timezone: 'America/New_York',
                title: 'Run local watchdog',
            },
            { now: () => new Date('2026-07-26T12:00:00.000Z') }
        );
        const fireClock = { now: () => new Date('2026-07-26T14:00:00.000Z') };

        await Promise.all([
            tickReminders(connection.db, fireClock),
            tickReminders(connection.db, fireClock),
        ]);

        expect(existsSync(canaryPath)).toBe(false);
        expect(
            await listReminderFires(connection.db, {
                actor: { agentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).toEqual([
            expect.objectContaining({
                firedAt: fireClock.now().toISOString(),
                reminderId: scheduled.reminder.id,
                scheduledFor: '2026-07-26T13:00:00.000Z',
            }),
        ]);
        expect(
            await listReminderAgentAttention(connection.db, { agentId, serverId })
        ).toContainEqual({
            agentId,
            anchorChatId: chatId,
            fireId: expect.any(String),
            id: expect.any(String),
            kind: 'reminder_script',
            queuedAt: fireClock.now().toISOString(),
            reminderId: scheduled.reminder.id,
            script,
        });
        expect(
            await listReminderAgentAttention(connection.db, { agentId, serverId })
        ).not.toContainEqual(
            expect.objectContaining({
                serverId,
            })
        );
        const [updated] = await listReminders(connection.db, {
            actor: { agentId, kind: 'agent' },
            serverId,
        }).then((reminders) =>
            reminders.filter((reminder) => reminder.id === scheduled.reminder.id)
        );
        expect(updated).toMatchObject({
            fireAt: '2026-07-27T13:00:00.000Z',
            status: 'scheduled',
            version: 2,
        });
        const transcript = await owner.trpc.chat.messages.query({
            chatId,
            limit: 20,
            serverId,
        });
        expect(transcript.messages.at(-1)?.id).toBe(anchorMessageId);
    });

    test('makes cancellation idempotent and terminal before concurrent ticks', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-cancel-schedule',
                repeat: 'daily@09:00',
                serverId,
                timezone: 'America/New_York',
                title: 'Cancel race',
            },
            { now: () => new Date('2026-07-28T12:00:00.000Z') }
        );
        const cancelInput = {
            commandId: 'reminder-command-cancel',
            expectedVersion: 1,
            reminderId: scheduled.reminder.id,
            serverId,
        };

        const canceled = await cancelReminder(connection.db, agentId, cancelInput, {
            now: () => new Date('2026-07-28T13:00:00.000Z'),
        });
        const retried = await cancelReminder(connection.db, agentId, cancelInput, {
            now: () => new Date('2026-07-28T13:01:00.000Z'),
        });
        await Promise.all([
            tickReminders(connection.db, {
                now: () => new Date('2026-08-28T13:00:00.000Z'),
            }),
            tickReminders(connection.db, {
                now: () => new Date('2026-08-28T13:00:00.000Z'),
            }),
        ]);

        expect(canceled.reminder.status).toBe('canceled');
        expect(retried).toEqual({ ...canceled, idempotent: true });
        expect(
            await listReminderFires(connection.db, {
                actor: { agentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).toHaveLength(0);
    });

    test('linearizes cancellation against a due fire', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-racing-cancel-schedule',
                fireAt: new Date('2026-07-28T13:00:00.000Z'),
                serverId,
                title: 'Cancel or fire once',
            },
            { now: () => new Date('2026-07-28T12:00:00.000Z') }
        );

        const [cancelResult] = await Promise.allSettled([
            cancelReminder(
                connection.db,
                agentId,
                {
                    commandId: 'reminder-command-racing-cancel',
                    expectedVersion: 1,
                    reminderId: scheduled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-07-28T13:00:00.000Z') }
            ),
            tickReminders(connection.db, {
                now: () => new Date('2026-07-28T13:00:00.000Z'),
            }),
        ]);
        const [persisted] = await listReminders(connection.db, {
            actor: { agentId, kind: 'agent' },
            serverId,
        }).then((reminders) =>
            reminders.filter((reminder) => reminder.id === scheduled.reminder.id)
        );
        const fires = await listReminderFires(connection.db, {
            actor: { agentId, kind: 'agent' },
            reminderId: scheduled.reminder.id,
            serverId,
        });

        if (cancelResult.status === 'fulfilled') {
            expect(cancelResult.value.reminder.status).toBe('canceled');
            expect(persisted?.status).toBe('canceled');
            expect(fires).toHaveLength(0);
        } else {
            expect(cancelResult.reason).toBeInstanceOf(ReminderVersionConflictError);
            expect(persisted?.status).toBe('fired');
            expect(fires).toHaveLength(1);
        }
    });

    test('updates and snoozes a reminder with optimistic versions', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-update-schedule',
                fireAt: new Date('2026-07-29T14:00:00.000Z'),
                serverId,
                title: 'Initial title',
            },
            { now: () => new Date('2026-07-29T12:00:00.000Z') }
        );
        const updateInput = {
            commandId: 'reminder-command-update',
            expectedVersion: 1,
            fireAt: new Date('2026-07-29T14:00:00.000Z'),
            reminderId: scheduled.reminder.id,
            repeat: 'weekly:mon,wed@10:00',
            script: 'echo opaque',
            serverId,
            title: 'Updated title',
        };
        const updated = await updateReminder(connection.db, agentId, updateInput, {
            now: () => new Date('2026-07-29T12:30:00.000Z'),
        });
        const snoozeInput = {
            commandId: 'reminder-command-snooze',
            duration: '30m',
            expectedVersion: 2,
            reminderId: scheduled.reminder.id,
            serverId,
        };
        const snoozed = await snoozeReminder(connection.db, agentId, snoozeInput, {
            now: () => new Date('2026-07-29T13:00:00.000Z'),
        });
        const retried = await snoozeReminder(connection.db, agentId, snoozeInput, {
            now: () => new Date('2026-07-29T14:00:00.000Z'),
        });
        const replayedUpdate = await updateReminder(connection.db, agentId, updateInput, {
            now: () => new Date('2026-08-01T14:00:00.000Z'),
        });

        expect(updated.reminder).toMatchObject({
            hasScript: true,
            repeat: 'weekly:mon,wed@10:00',
            title: 'Updated title',
            version: 2,
        });
        expect(snoozed.reminder).toMatchObject({
            fireAt: '2026-07-29T13:30:00.000Z',
            status: 'scheduled',
            version: 3,
        });
        expect(retried).toEqual({ ...snoozed, idempotent: true });
        expect(replayedUpdate).toEqual({ ...snoozed, idempotent: true });
    });

    test('serializes concurrent retries of the same update command', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-concurrent-update-schedule',
                fireAt: new Date('2026-07-30T15:00:00.000Z'),
                serverId,
                title: 'Concurrent update retry',
            },
            { now: () => new Date('2026-07-29T12:00:00.000Z') }
        );
        const input = {
            commandId: 'reminder-command-concurrent-update',
            expectedVersion: 1,
            reminderId: scheduled.reminder.id,
            serverId,
            title: 'Updated exactly once',
        };

        const results = await Promise.all([
            updateReminder(connection.db, agentId, input, {
                now: () => new Date('2026-07-29T13:00:00.000Z'),
            }),
            updateReminder(connection.db, agentId, input, {
                now: () => new Date('2026-07-29T13:00:00.000Z'),
            }),
        ]);

        expect(results.map((result) => result.idempotent).sort()).toEqual([false, true]);
        expect(results[0]?.reminder).toEqual(results[1]?.reminder);
    });

    test('rejects an update whose recurrence cannot produce a supported future date', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-overflow-schedule',
                fireAt: new Date('2026-07-30T14:00:00.000Z'),
                serverId,
                title: 'Keep a valid cadence',
            },
            { now: () => new Date('2026-07-29T12:00:00.000Z') }
        );

        await expect(
            updateReminder(
                connection.db,
                agentId,
                {
                    commandId: 'reminder-command-overflow-update',
                    expectedVersion: 1,
                    reminderId: scheduled.reminder.id,
                    repeat: 'every:100000000d',
                    serverId,
                },
                { now: () => new Date('2026-07-29T13:00:00.000Z') }
            )
        ).rejects.toThrow('supported date range');

        const [persisted] = await listReminders(connection.db, {
            actor: { agentId, kind: 'agent' },
            serverId,
        }).then((reminders) =>
            reminders.filter((reminder) => reminder.id === scheduled.reminder.id)
        );
        expect(persisted).toMatchObject({ repeat: null, version: 1 });
    });

    test('does not resurrect a fired reminder without a new future fire time', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-fired-update-schedule',
                fireAt: new Date('2026-07-30T16:00:00.000Z'),
                serverId,
                title: 'Fire once',
            },
            { now: () => new Date('2026-07-30T15:00:00.000Z') }
        );
        await tickReminders(connection.db, {
            now: () => new Date('2026-07-30T16:00:00.000Z'),
        });

        await expect(
            updateReminder(
                connection.db,
                agentId,
                {
                    commandId: 'reminder-command-fired-title-update',
                    expectedVersion: 2,
                    reminderId: scheduled.reminder.id,
                    serverId,
                    title: 'Do not resurrect',
                },
                { now: () => new Date('2026-07-30T16:01:00.000Z') }
            )
        ).rejects.toThrow('future fire time');
        expect(
            await listReminderFires(connection.db, {
                actor: { agentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).toHaveLength(1);
    });

    test('uses a server-owned fire nonce that a Chat member cannot squat', async () => {
        const fireAt = new Date('2026-07-31T15:00:00.000Z');
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-nonce-schedule',
                fireAt,
                serverId,
                title: 'Unspoofed fire',
            },
            { now: () => new Date('2026-07-31T14:00:00.000Z') }
        );
        await owner.trpc.chat.send.mutate({
            chatId,
            content: 'Squatted client nonce',
            nonce: `reminder:fire:${scheduled.reminder.id}:${fireAt.toISOString()}`,
            serverId,
        });

        await tickReminders(connection.db, { now: () => fireAt });

        expect(
            await listReminderFires(connection.db, {
                actor: { agentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).toHaveLength(1);
    });

    test('allows exactly one concurrent update or snooze at a version', async () => {
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'reminder-command-reschedule-race',
                fireAt: new Date('2026-07-30T14:00:00.000Z'),
                serverId,
                title: 'Reschedule race',
            },
            { now: () => new Date('2026-07-29T12:00:00.000Z') }
        );

        const results = await Promise.allSettled([
            updateReminder(
                connection.db,
                agentId,
                {
                    commandId: 'reminder-command-racing-update',
                    expectedVersion: 1,
                    reminderId: scheduled.reminder.id,
                    serverId,
                    title: 'Update won',
                },
                { now: () => new Date('2026-07-29T13:00:00.000Z') }
            ),
            snoozeReminder(
                connection.db,
                agentId,
                {
                    commandId: 'reminder-command-racing-snooze',
                    duration: '30m',
                    expectedVersion: 1,
                    reminderId: scheduled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-07-29T13:00:00.000Z') }
            ),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const [rejected] = results.filter((result) => result.status === 'rejected');
        expect(rejected?.reason).toBeInstanceOf(ReminderVersionConflictError);
        const [persisted] = await listReminders(connection.db, {
            actor: { agentId, kind: 'agent' },
            serverId,
        }).then((reminders) =>
            reminders.filter((reminder) => reminder.id === scheduled.reminder.id)
        );
        expect(persisted?.version).toBe(2);
    });

    test('cancels a retired author and purges its unacknowledged attention', async () => {
        const retiredAgentId = 'agt_retired_reminder';
        await addAgent(retiredAgentId);
        const scheduled = await scheduleReminder(
            connection.db,
            retiredAgentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'retired-agent-schedule',
                fireAt: new Date('2026-07-30T13:00:00.000Z'),
                repeat: 'every:1h',
                serverId,
                title: 'Retirement cleanup',
            },
            { now: () => new Date('2026-07-30T12:00:00.000Z') }
        );
        await tickReminders(connection.db, {
            now: () => new Date('2026-07-30T13:00:00.000Z'),
        });
        await harness.sql`
            update agents set retired_at = '2026-07-30T13:30:00.000Z'
            where server_id = ${serverId} and id = ${retiredAgentId}
        `;

        await tickReminders(connection.db, {
            now: () => new Date('2026-07-30T14:00:00.000Z'),
        });

        expect(
            await harness.sql`
                select status, version from reminders
                where server_id = ${serverId} and id = ${scheduled.reminder.id}
            `
        ).toEqual([{ status: 'canceled', version: 3 }]);
        expect(
            await harness.sql`
                select id from reminder_agent_attention
                where server_id = ${serverId} and reminder_id = ${scheduled.reminder.id}
            `
        ).toEqual([]);
        expect(
            await harness.sql`
                select id from reminder_fires
                where server_id = ${serverId} and reminder_id = ${scheduled.reminder.id}
            `
        ).toHaveLength(1);
    });

    test('cancels before firing when the author loses anchor access', async () => {
        const removedAgentId = 'agt_removed_from_channel';
        await addAgent(removedAgentId);
        const scheduled = await scheduleReminder(
            connection.db,
            removedAgentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'removed-agent-schedule',
                fireAt: new Date('2026-07-31T13:00:00.000Z'),
                serverId,
                title: 'No longer authorized',
            },
            { now: () => new Date('2026-07-31T12:00:00.000Z') }
        );
        await harness.sql`
            delete from channel_agent_participants
            where server_id = ${serverId} and agent_id = ${removedAgentId}
        `;

        await expect(
            snoozeReminder(
                connection.db,
                removedAgentId,
                {
                    commandId: 'removed-agent-snooze',
                    duration: '1h',
                    expectedVersion: 1,
                    reminderId: scheduled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-07-31T12:30:00.000Z') }
            )
        ).rejects.toThrow(/access the anchor Chat/i);
        await expect(
            listReminders(connection.db, {
                actor: { agentId: removedAgentId, kind: 'agent' },
                serverId,
            })
        ).rejects.toThrow(/access the anchor Chat/i);
        await expect(
            listReminderFires(connection.db, {
                actor: { agentId: removedAgentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).rejects.toThrow(/access the anchor Chat/i);
        await expect(
            cancelReminder(
                connection.db,
                removedAgentId,
                {
                    commandId: 'removed-agent-cancel',
                    expectedVersion: 1,
                    reminderId: scheduled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-07-31T12:30:00.000Z') }
            )
        ).rejects.toThrow(/access the anchor Chat/i);
        await tickReminders(connection.db, {
            now: () => new Date('2026-07-31T13:00:00.000Z'),
        });

        expect(
            await harness.sql`
                select status from reminders
                where server_id = ${serverId} and id = ${scheduled.reminder.id}
            `
        ).toEqual([{ status: 'canceled' }]);
        expect(
            await harness.sql`
                select id from reminder_fires
                where server_id = ${serverId} and reminder_id = ${scheduled.reminder.id}
            `
        ).toEqual([]);
    });

    test('keeps reminder state, mutations, and delivery isolated to its owning Agent', async () => {
        const otherAgentId = 'agt_other_reminder';
        await addAgent(otherAgentId);
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId,
                commandId: 'owner-isolation-schedule',
                fireAt: new Date('2026-08-01T13:00:00.000Z'),
                serverId,
                title: 'Owner-only follow-up',
            },
            { now: () => new Date('2026-08-01T12:00:00.000Z') }
        );

        await expect(
            listReminders(connection.db, {
                actor: { agentId: otherAgentId, kind: 'agent' },
                serverId,
            })
        ).resolves.toEqual([]);
        await expect(
            listReminderFires(connection.db, {
                actor: { agentId: otherAgentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).rejects.toThrow(/not owned by this Agent/i);
        await expect(
            cancelReminder(
                connection.db,
                otherAgentId,
                {
                    commandId: 'other-agent-cancel',
                    expectedVersion: scheduled.reminder.version,
                    reminderId: scheduled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-08-01T12:30:00.000Z') }
            )
        ).rejects.toThrow(/not owned by this Agent/i);
        await expect(
            updateReminder(
                connection.db,
                otherAgentId,
                {
                    commandId: 'other-agent-update',
                    expectedVersion: scheduled.reminder.version,
                    reminderId: scheduled.reminder.id,
                    serverId,
                    title: 'Hijacked follow-up',
                },
                { now: () => new Date('2026-08-01T12:30:00.000Z') }
            )
        ).rejects.toThrow(/not owned by this Agent/i);
        await expect(
            snoozeReminder(
                connection.db,
                otherAgentId,
                {
                    commandId: 'other-agent-snooze',
                    duration: '1h',
                    expectedVersion: scheduled.reminder.version,
                    reminderId: scheduled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-08-01T12:30:00.000Z') }
            )
        ).rejects.toThrow(/not owned by this Agent/i);

        await tickReminders(connection.db, {
            now: () => new Date('2026-08-01T13:00:00.000Z'),
        });
        await expect(
            listReminderAgentAttention(connection.db, { agentId, serverId })
        ).resolves.toContainEqual(
            expect.objectContaining({ agentId, reminderId: scheduled.reminder.id })
        );
        await expect(
            listReminderAgentAttention(connection.db, { agentId: otherAgentId, serverId })
        ).resolves.toEqual([]);
    });
});

async function addAgent(id: string) {
    const handle = id.replaceAll('_', '-');
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${id}, ${serverId}, ${handle}, ${id}, 'America/New_York')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${id})
    `;
}
