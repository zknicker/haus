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
    const token = await harness.humans.mintSessionToken('user_reminder_anchor_owner');
    owner = createHausClient(harness, token);
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder Anchor Server',
        slug: 'reminder-anchor-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Check deployment health.',
        nonce: 'reminder-anchor-access',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    agentId = 'agt_reminder_anchor';
    await addAgent(agentId);
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

describe('reminder author anchor access', () => {
    test('lists and cancels a reminder after the author loses anchor access', async () => {
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

    test('left-channel reminders do not block list, update, cancel, or fire elsewhere', async () => {
        const authorId = 'agt_left_channel_author';
        await addAgent(authorId);
        const leftChat = await owner.trpc.chat.createChannel.mutate({
            agentIds: [authorId],
            name: 'tech-ops',
            serverId,
        });
        const keptChat = await owner.trpc.chat.createChannel.mutate({
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
        await harness.sql`
            delete from channel_agent_participants
            where server_id = ${serverId}
              and chat_id = ${leftChat.id}
              and agent_id = ${authorId}
        `;

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
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${id}, ${serverId}, ${handle}, ${id}, 'America/New_York')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${id})
    `;
}
