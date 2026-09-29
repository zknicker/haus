import { afterAll, beforeAll, expect, test } from 'bun:test';
import { assignAgentTask } from '../src/agent-api/task-assign.ts';
import { claimAgentTasks } from '../src/agent-api/task-claims.ts';
import { updateAgentTask } from '../src/agent-api/tasks.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { FakeTransport } from './background-claim-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let delivery: AgentDelivery;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    delivery = new AgentDelivery(connection.db, new FakeTransport());
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_perm_owner'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('any member Agent moves status along the transition table, not only the holder', async () => {
    const server = await createServer('member-status');
    const [ada, rook] = await Promise.all([seedAgent(server, 'ada'), seedAgent(server, 'rook')]);
    const task = await createTask(server, 'Ship the importer');
    await claimAgentTasks(connection.db, ada, { numbers: [task.number], target: server.target });
    await update(ada, task.number, 'in_review');

    // Rook reviews Ada's task and finishes it without holding it.
    const done = await update(rook, task.number, 'done');
    expect(done.task).toMatchObject({ assignee: { handle: 'ada' }, status: 'done' });

    await expect(update(rook, task.number, 'done')).rejects.toThrow('already done');
    const fresh = await createTask(server, 'Unstarted work');
    await expect(update(rook, fresh.number, 'done')).rejects.toThrow(
        'A task cannot move from todo to done.'
    );
    await expect(update(rook, fresh.number, 'in_progress')).rejects.toThrow(
        'Claim the task before moving it to in_progress.'
    );
});

test('a Server Owner still sets any status directly', async () => {
    const server = await createServer('owner-status');
    const task = await createTask(server, 'Owner closes this out');
    const updated = await owner.trpc.task.update.mutate({
        expectedVersion: task.version,
        messageId: task.messageId,
        patch: { status: 'done' },
        serverId: server.id,
    });
    expect(updated.task.status).toBe('done');
});

test('an Agent reassigns a held task to a peer without moving status, and the peer gets the handoff', async () => {
    const server = await createServer('assign-held');
    const [ada, rook, kit] = await Promise.all([
        seedAgent(server, 'ada'),
        seedAgent(server, 'rook'),
        seedAgent(server, 'kit'),
    ]);
    const task = await createTask(server, 'Rotate the signing key');
    await claimAgentTasks(connection.db, rook, { numbers: [task.number], target: server.target });

    const result = await assign(ada, task.number, '@kit');

    expect(result.task).toMatchObject({ assignee: { handle: 'kit' }, status: 'in_progress' });
    expect(result.wakes).toEqual([kit.agentId]);
    const [row] = (await harness.sql`
        select claimed_at, status from message_tasks
        where server_id = ${server.id} and message_id = ${task.messageId}
    `) as { claimed_at: Date | null; status: string }[];
    expect(row).toEqual({ claimed_at: null, status: 'in_progress' });
    const handoffs = (await harness.sql`
        select content from agent_inbox
        where server_id = ${server.id} and agent_id = ${kit.agentId}
          and source = 'task_assignment'
    `) as { content: string }[];
    expect(handoffs.map((handoff) => handoff.content)).toEqual([
        `[Haus task assignment task=#${task.number} target=${server.target} assignedBy=@ada] Rotate the signing key`,
    ]);

    const cleared = await assignAgentTask(connection.db, ada, delivery, {
        assignee: null,
        number: task.number,
        target: server.target,
    });
    expect(cleared.task).toMatchObject({ assignee: null, status: 'in_progress' });
});

test('an Agent cannot assign a person, and loses to a stale revision', async () => {
    const server = await createServer('assign-human');
    const ada = await seedAgent(server, 'ada');
    await harness.sql`
        update server_memberships set handle = 'perm-owner' where server_id = ${server.id}
    `;
    const task = await createTask(server, 'Approve the budget');

    // Tasks are Agent work (ADR 0037): a person is @mentioned, never assigned.
    await expect(
        assignAgentTask(connection.db, ada, delivery, {
            assignee: '@perm-owner',
            expectedRevision: task.version,
            number: task.number,
            target: server.target,
        })
    ).rejects.toThrow(/@perm-owner is not assignable/u);

    const assigned = await assignAgentTask(connection.db, ada, delivery, {
        assignee: '@ada',
        expectedRevision: task.version,
        number: task.number,
        target: server.target,
    });
    expect(assigned.task).toMatchObject({ assignee: { handle: 'ada' }, status: 'todo' });

    await expect(
        assignAgentTask(connection.db, ada, delivery, {
            assignee: null,
            expectedRevision: task.version,
            number: task.number,
            target: server.target,
        })
    ).rejects.toThrow(/changed \(revision 2, expected 1\)/u);
});

test('missing, retired, and out-of-chat handles answer one uniform refusal', async () => {
    const server = await createServer('assign-uniform');
    const ada = await seedAgent(server, 'ada');
    await seedAgent(server, 'outsider', { joinChat: false });
    const retired = await seedAgent(server, 'gone');
    await harness.sql`update agents set retired_at = now() where id = ${retired.agentId}`;
    const task = await createTask(server, 'Nobody odd owns this');

    for (const handle of ['@ghost', '@outsider', '@gone']) {
        await expect(assign(ada, task.number, handle)).rejects.toThrow(
            `${handle} is not assignable in this chat.`
        );
    }
    const [row] = (await harness.sql`
        select version from message_tasks
        where server_id = ${server.id} and message_id = ${task.messageId}
    `) as { version: number }[];
    expect(row?.version).toBe(task.version);
});

const targets = new Map<string, string>();

function update(
    runner: ResolvedRunner,
    number: number,
    status: 'done' | 'in_progress' | 'in_review'
) {
    const target = targets.get(runner.serverId) ?? '';
    return updateAgentTask(connection.db, runner, { number, status, target });
}

function assign(runner: ResolvedRunner, number: number, assignee: string) {
    const target = targets.get(runner.serverId) ?? '';
    return assignAgentTask(connection.db, runner, delivery, { assignee, number, target });
}

async function createServer(slug: string) {
    const server = await owner.trpc.server.create.mutate({
        displayName: slug,
        slug: `perm-${slug}`,
    });
    const target = `#${server.channels[0].name ?? ''}`;
    targets.set(server.id, target);
    return { chatId: server.channels[0].id, id: server.id, target };
}

async function createTask(server: { chatId: string; id: string }, content: string) {
    const created = await owner.trpc.task.create.mutate({
        chatId: server.chatId,
        content,
        nonce: `${server.id}:${content}`,
        serverId: server.id,
    });
    return created.task;
}

async function seedAgent(
    server: { chatId: string; id: string; target: string },
    handle: string,
    options: { joinChat: boolean } = { joinChat: true }
): Promise<ResolvedRunner> {
    const agentId = `agt_${handle}${server.id.slice(4, 12)}`;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${server.id}, ${handle}, ${handle}, 'UTC')
    `;
    if (options.joinChat) {
        await harness.sql`
            insert into channel_agent_participants (server_id, chat_id, agent_id)
            values (${server.id}, ${server.chatId}, ${agentId})
        `;
    }
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
