import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    cancelReminder,
    listReminderFires,
    listReminders,
    scheduleReminder,
    snoozeReminder,
    tickReminders,
    updateReminder,
} from '../src/reminders/reminders.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { createTestProject } from './project.fixture.ts';

let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    const token = await harness.humans.mintSessionToken('user_reminder_anchor_owner');
    owner = createHausClient(harness, token);
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder Anchor Server',
        slug: 'reminder-anchor-server',
    });
    serverId = server.id;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

describe('reminder author anchor access', () => {
    test('lists and cancels a reminder after its anchor channel is deleted', async () => {
        const removedAgentId = 'agt_removed_from_channel';
        await addAgent(removedAgentId);
        const goneChat = await createTestProject(owner, {
            agentIds: [],
            name: 'tech-gone',
            serverId,
        });
        const goneAnchor = await owner.trpc.chat.send.mutate({
            chatId: goneChat.id,
            content: 'Gone follow-up.',
            nonce: 'gone-channel-anchor',
            serverId,
        });
        const scheduled = await scheduleReminder(
            connection.db,
            removedAgentId,
            {
                anchorChatId: goneChat.id,
                anchorMessageId: goneAnchor.message.id,
                commandId: 'removed-agent-schedule',
                fireAt: new Date('2026-07-31T13:00:00.000Z'),
                serverId,
                title: 'No longer authorized',
            },
            { now: () => new Date('2026-07-31T12:00:00.000Z') }
        );
        await softDeleteChat(goneChat.id);

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
        ).resolves.toEqual([
            expect.objectContaining({
                anchorAccessible: false,
                id: scheduled.reminder.id,
                status: 'scheduled',
            }),
        ]);
        await expect(
            listReminderFires(connection.db, {
                actor: { agentId: removedAgentId, kind: 'agent' },
                reminderId: scheduled.reminder.id,
                serverId,
            })
        ).resolves.toEqual([]);
        const canceled = await cancelReminder(
            connection.db,
            removedAgentId,
            {
                commandId: 'removed-agent-cancel',
                expectedVersion: 1,
                reminderId: scheduled.reminder.id,
                serverId,
            },
            { now: () => new Date('2026-07-31T12:30:00.000Z') }
        );
        expect(canceled.reminder.status).toBe('canceled');
        await expect(
            listReminders(connection.db, {
                actor: { agentId: removedAgentId, kind: 'agent' },
                serverId,
            })
        ).resolves.toEqual([]);
    });

    test('deleted-channel reminders do not block list, update, cancel, or fire elsewhere', async () => {
        const authorId = 'agt_left_channel_author';
        await addAgent(authorId);
        const leftChat = await createTestProject(owner, {
            agentIds: [authorId],
            name: 'tech-ops',
            serverId,
        });
        const keptChat = await createTestProject(owner, {
            agentIds: [authorId],
            name: 'tech-alerts',
            serverId,
        });
        const leftAnchor = await owner.trpc.chat.send.mutate({
            chatId: leftChat.id,
            content: 'Ops follow-up.',
            nonce: 'left-channel-anchor',
            serverId,
        });
        const keptAnchor = await owner.trpc.chat.send.mutate({
            chatId: keptChat.id,
            content: 'Alerts follow-up.',
            nonce: 'kept-channel-anchor',
            serverId,
        });
        const leftReminder = await scheduleReminder(
            connection.db,
            authorId,
            {
                anchorChatId: leftChat.id,
                anchorMessageId: leftAnchor.message.id,
                commandId: 'left-channel-schedule',
                fireAt: new Date('2026-08-02T13:00:00.000Z'),
                serverId,
                title: 'Left channel reminder',
            },
            { now: () => new Date('2026-08-02T12:00:00.000Z') }
        );
        await cancelReminder(
            connection.db,
            authorId,
            {
                commandId: 'left-channel-pre-cancel',
                expectedVersion: leftReminder.reminder.version,
                reminderId: leftReminder.reminder.id,
                serverId,
            },
            { now: () => new Date('2026-08-02T12:05:00.000Z') }
        );
        const keptReminder = await scheduleReminder(
            connection.db,
            authorId,
            {
                anchorChatId: keptChat.id,
                anchorMessageId: keptAnchor.message.id,
                commandId: 'kept-channel-schedule',
                fireAt: new Date('2026-08-02T14:00:00.000Z'),
                serverId,
                title: 'Kept channel reminder',
            },
            { now: () => new Date('2026-08-02T12:10:00.000Z') }
        );
        await softDeleteChat(leftChat.id);

        await expect(
            listReminders(connection.db, {
                actor: { agentId: authorId, kind: 'agent' },
                serverId,
            })
        ).resolves.toEqual([
            expect.objectContaining({
                anchorAccessible: true,
                id: keptReminder.reminder.id,
                status: 'scheduled',
            }),
        ]);

        const updated = await updateReminder(
            connection.db,
            authorId,
            {
                commandId: 'kept-channel-update',
                expectedVersion: keptReminder.reminder.version,
                reminderId: keptReminder.reminder.id,
                serverId,
                title: 'Kept channel reminder updated',
            },
            { now: () => new Date('2026-08-02T12:20:00.000Z') }
        );
        expect(updated.reminder.title).toBe('Kept channel reminder updated');

        const canceled = await cancelReminder(
            connection.db,
            authorId,
            {
                commandId: 'kept-channel-cancel',
                expectedVersion: updated.reminder.version,
                reminderId: keptReminder.reminder.id,
                serverId,
            },
            { now: () => new Date('2026-08-02T12:30:00.000Z') }
        );
        expect(canceled.reminder.status).toBe('canceled');

        const liveReminder = await scheduleReminder(
            connection.db,
            authorId,
            {
                anchorChatId: keptChat.id,
                anchorMessageId: keptAnchor.message.id,
                commandId: 'kept-channel-live-schedule',
                fireAt: new Date('2026-08-02T16:00:00.000Z'),
                serverId,
                title: 'Kept channel still fires',
            },
            { now: () => new Date('2026-08-02T12:40:00.000Z') }
        );
        await tickReminders(connection.db, {
            now: () => new Date('2026-08-02T16:00:00.000Z'),
        });
        expect(
            await harness.sql`
                select status from reminders
                where server_id = ${serverId} and id = ${liveReminder.reminder.id}
            `
        ).toEqual([{ status: 'fired' }]);
        expect(
            await harness.sql`
                select id from reminder_fires
                where server_id = ${serverId} and reminder_id = ${liveReminder.reminder.id}
            `
        ).toHaveLength(1);
        expect(
            await harness.sql`
                select status from reminders
                where server_id = ${serverId} and id = ${leftReminder.reminder.id}
            `
        ).toEqual([{ status: 'canceled' }]);
    });
});

async function addAgent(id: string) {
    const handle = id.replaceAll('_', '-');
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone, home_project_id)
        values (${id}, ${serverId}, ${handle}, ${id}, 'America/New_York', (select id from chats where server_id = ${serverId} and is_all))
    `;
}

async function softDeleteChat(id: string) {
    await harness.sql`
        update chats set deleted_at = now(), deleted_by_user_id = (
            select user_id from server_memberships
            where server_id = ${serverId} and role = 'owner'
            limit 1
        )
        where server_id = ${serverId} and id = ${id}
    `;
}
