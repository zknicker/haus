import { afterAll, beforeAll, test } from 'bun:test';
import type { SQL } from 'bun';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import {
    cancelReminder,
    scheduleReminder,
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
    const token = await harness.humans.mintSessionToken('user_reminder_lock_owner');
    owner = createHausClient(harness, token);
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder Lock Server',
        slug: 'reminder-lock-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Reminder lock anchor',
        nonce: 'reminder-lock-anchor',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    agentId = 'agt_reminder_lock';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'lock', 'Lock', 'America/New_York')
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

test('all reminder writes take the Server lock before descendant rows', async () => {
    const updated = await schedule('lock-update', 'Update lock', '2026-07-28T14:00:00.000Z');
    const canceled = await schedule('lock-cancel', 'Cancel lock', '2026-07-28T15:00:00.000Z');
    const fired = await schedule('lock-fire', 'Fire lock', '2026-07-28T13:00:00.000Z');

    await expectServerFirst(
        () => schedule('lock-schedule', 'Schedule lock', '2026-07-28T16:00:00.000Z'),
        async (tx) => {
            await tx`select id from chats where server_id = ${serverId} and id = ${chatId} for update`;
        }
    );
    await expectServerFirst(
        () =>
            updateReminder(
                connection.db,
                agentId,
                {
                    commandId: 'lock-update-command',
                    expectedVersion: updated.reminder.version,
                    reminderId: updated.reminder.id,
                    serverId,
                    title: 'Updated after lock',
                },
                { now: () => new Date('2026-07-28T12:00:00.000Z') }
            ),
        async (tx) => {
            await tx`select id from reminders where id = ${updated.reminder.id} for update`;
        }
    );
    await expectServerFirst(
        () =>
            cancelReminder(
                connection.db,
                agentId,
                {
                    commandId: 'lock-cancel-command',
                    expectedVersion: canceled.reminder.version,
                    reminderId: canceled.reminder.id,
                    serverId,
                },
                { now: () => new Date('2026-07-28T12:00:00.000Z') }
            ),
        async (tx) => {
            await tx`select id from reminders where id = ${canceled.reminder.id} for update`;
        }
    );
    await expectServerFirst(
        () =>
            tickReminders(connection.db, {
                now: () => new Date('2026-07-28T13:00:00.000Z'),
            }),
        async (tx) => {
            await tx`select id from reminders where id = ${fired.reminder.id} for update`;
        }
    );
});

async function schedule(commandId: string, title: string, fireAt: string) {
    return await scheduleReminder(
        connection.db,
        agentId,
        {
            anchorChatId: chatId,
            anchorMessageId,
            commandId,
            fireAt: new Date(fireAt),
            serverId,
            title,
        },
        { now: () => new Date('2026-07-28T12:00:00.000Z') }
    );
}

async function expectServerFirst(
    run: () => Promise<unknown>,
    lockDescendant: (tx: SQL) => Promise<void>
) {
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const serverLock = harness.sql.begin(async (tx) => {
        await tx`select id from servers where id = ${serverId} for update`;
        held.resolve();
        await release.promise;
    });
    await held.promise;
    const operation = run();
    operation.catch(() => undefined);

    try {
        await waitForBlockedTransaction();
        await harness.sql.begin(async (tx) => {
            await tx`set local lock_timeout = '100ms'`;
            await lockDescendant(tx);
        });
    } finally {
        release.resolve();
        await serverLock;
    }
    await operation;
}

async function waitForBlockedTransaction() {
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
        const [row] = (await harness.sql`
            select exists (
                select 1
                from pg_stat_activity
                where datname = current_database()
                  and pid <> pg_backend_pid()
                  and wait_event_type = 'Lock'
            ) as waiting
        `) as { waiting: boolean }[];
        if (row?.waiting) {
            return;
        }
    }
    throw new Error('Reminder write did not reach the held Server lock.');
}
