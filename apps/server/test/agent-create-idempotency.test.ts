import { afterAll, beforeAll, expect, test } from 'bun:test';
import { scheduleAgentReminder } from '../src/agent-api/reminders.ts';
import { createAgentTasks } from '../src/agent-api/task-create.ts';
import { AgentTaskNonceReusedError } from '../src/agent-api/task-error.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { ReminderCommandConflictError } from '../src/reminders/reminder-model.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let delivery: AgentDelivery;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_idem_owner'));
    delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('concurrent task creates on one nonce write one batch and replay it without side effects', async () => {
    const server = await createServer('task-idem-race');
    const [ada] = await Promise.all([
        seedAgentRunner(server, 'ada'),
        seedAgentRunner(server, 'rook'),
    ]);
    const input = {
        assignee: '@rook',
        nonce: 'task-race',
        target: `#${server.chatName}`,
        titles: ['Draft the migration', 'Review the rollout'],
    };

    const results = await Promise.all([
        createAgentTasks(connection.db, ada, input, delivery),
        createAgentTasks(connection.db, ada, input, delivery),
    ]);
    const after = await sideEffects(server.id);
    const replay = await createAgentTasks(connection.db, ada, input, delivery);

    const ids = (tasks: (typeof replay)['tasks']) =>
        tasks.map(({ message, number }) => ({ id: message.id, number }));
    expect(ids(results[0].tasks)).toEqual(ids(results[1].tasks));
    expect(ids(replay.tasks)).toEqual(ids(results[0].tasks));
    // Exactly one of the racing requests did the writing; the other replayed.
    expect(results.map((result) => result.events.length).sort()).toEqual([0, 4]);
    expect(replay).toMatchObject({ activities: [], events: [], wakes: [] });
    expect(after).toEqual({ inbox: 4, messages: 2, taskEvents: 2, tasks: 2 });
    expect(await sideEffects(server.id)).toEqual(after);
});

test('a task nonce reused for a different batch is refused, never partially replayed', async () => {
    const server = await createServer('task-idem-reuse');
    const ada = await seedAgentRunner(server, 'ada');
    const input = {
        nonce: 'task-reuse',
        target: `#${server.chatName}`,
        titles: ['Tag the release', 'Write the notes'],
    };
    await createAgentTasks(connection.db, ada, input, delivery);

    for (const titles of [['Tag the release'], ['Tag the release', 'Write other notes']]) {
        await expect(
            createAgentTasks(connection.db, ada, { ...input, titles }, delivery)
        ).rejects.toBeInstanceOf(AgentTaskNonceReusedError);
    }
    await expect(
        createAgentTasks(connection.db, ada, { ...input, assignee: '@ada' }, delivery)
    ).rejects.toBeInstanceOf(AgentTaskNonceReusedError);
    expect((await sideEffects(server.id)).tasks).toBe(2);
});

test('concurrent reminder schedules on one command id write one reminder and one event', async () => {
    const server = await createServer('reminder-idem-race');
    const ada = await seedAgentRunner(server, 'ada');
    const anchor = await owner.trpc.task.create.mutate({
        chatId: server.chatId,
        content: 'Anchor for the reminder',
        nonce: `${server.id}:anchor`,
        serverId: server.id,
    });
    const input = {
        commandId: 'reminder-race',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        messageId: anchor.task.messageId,
        title: 'Check the rollout',
    };

    const results = await Promise.all([
        scheduleAgentReminder(connection.db, ada, input),
        scheduleAgentReminder(connection.db, ada, input),
    ]);

    expect(results[1].reminder).toEqual(results[0].reminder);
    await expect(
        scheduleAgentReminder(connection.db, ada, { ...input, title: 'Check something else' })
    ).rejects.toBeInstanceOf(ReminderCommandConflictError);
    const [counts] = (await harness.sql`
        select
            (select count(*)::int from reminders where server_id = ${server.id}) as reminders,
            (select count(*)::int from reminder_commands where server_id = ${server.id}) as commands,
            (select count(*)::int from chat_events
                where server_id = ${server.id} and event_type = 'reminder.changed') as events
    `) as Array<{ commands: number; events: number; reminders: number }>;
    expect(counts).toEqual({ commands: 1, events: 1, reminders: 1 });
});

async function sideEffects(serverId: string) {
    const [row] = (await harness.sql`
        select
            (select count(*)::int from chat_messages
                where server_id = ${serverId} and author_agent_id is not null) as messages,
            (select count(*)::int from message_tasks where server_id = ${serverId}) as tasks,
            (select count(*)::int from chat_events
                where server_id = ${serverId} and event_type = 'task.created') as "taskEvents",
            (select count(*)::int from agent_inbox where server_id = ${serverId}) as inbox
    `) as Array<{ inbox: number; messages: number; taskEvents: number; tasks: number }>;
    return row;
}

async function createServer(slug: string) {
    const server = await owner.trpc.server.create.mutate({ displayName: slug, slug });
    return {
        chatId: server.channels[0].id,
        chatName: server.channels[0].name ?? '',
        id: server.id,
    };
}

async function seedAgentRunner(
    server: { chatId: string; id: string },
    handle: string
): Promise<ResolvedRunner> {
    const agentId = `agt_${handle}${server.id.slice(4, 12)}`;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${server.id}, ${handle}, ${handle}, 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${server.id}, ${server.chatId}, ${agentId})
    `;
    return {
        agentId,
        capabilities: [],
        chatId: server.chatId,
        computerId: `cmp_${handle}`,
        runId: `run_${handle}`,
        runnerId: `rnr_${handle}`,
        serverId: server.id,
    };
}
