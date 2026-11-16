import { beforeAll, describe, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let runner: { token: string };

interface Reply {
    body: Record<string, any>;
    status: number;
}

async function call(path: string, body?: unknown, as = runner): Promise<Reply> {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
            authorization: `Bearer ${as.token}`,
            'content-type': 'application/json',
        },
        method: body === undefined ? 'GET' : 'POST',
    });
    return { body: (await response.json()) as Record<string, any>, status: response.status };
}

async function create(body: Record<string, unknown>) {
    const created = await call('/api/agent/tasks/create', { board: 'GEN', ...body });
    expect(created.status).toBe(200);
    return created.body.task as Record<string, any>;
}

beforeAll(async () => {
    runner = await fixture.mintRunner('run_agent_task_routes');
    await fixture.owner.trpc.taskLabel.create.mutate({
        name: 'Security',
        serverId: fixture.serverId,
    });
});

describe('create and list', () => {
    test('defaults to the first todo column and resolves handles, columns, and labels', async () => {
        const plain = await create({ title: 'Plain' });
        expect(plain).toMatchObject({
            assignee: null,
            board: 'GEN',
            category: 'todo',
            column: 'Todo',
            createdBy: { handle: 'orbit', type: 'agent' },
            labels: [],
            priority: 'none',
            title: 'Plain',
            version: 1,
        });
        expect(plain).not.toHaveProperty('description');

        const rich = await create({
            assignee: '@ada',
            column: 'in progress',
            description: 'All of it.',
            dueOn: '2026-12-01',
            labels: ['security'],
            priority: 'urgent',
            title: 'Rich',
        });
        expect(rich).toMatchObject({
            assignee: { handle: 'ada', type: 'human' },
            category: 'active',
            column: 'In progress',
            dueOn: '2026-12-01',
            labels: ['Security'],
            priority: 'urgent',
        });
    });

    test('refuses names that resolve to nothing, with the reason', async () => {
        const nobody = await call('/api/agent/tasks/create', {
            assignee: '@nobody',
            board: 'GEN',
            title: 'x',
        });
        expect(nobody).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
        expect(nobody.body.message).toContain('@nobody');
        const column = await call('/api/agent/tasks/create', {
            board: 'GEN',
            column: 'Nope',
            title: 'x',
        });
        expect(column.body.message).toContain('Backlog');
        const label = await call('/api/agent/tasks/create', {
            board: 'GEN',
            labels: ['nope'],
            title: 'x',
        });
        expect(label.status).toBe(400);
        const board = await call('/api/agent/tasks/create', { board: 'ZZZ', title: 'x' });
        expect(board).toMatchObject({ body: { code: 'BOARD_NOT_FOUND' }, status: 404 });
        const blank = await call('/api/agent/tasks/create', { board: 'GEN', title: ' ' });
        expect(blank).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    });

    test('lists open Tasks by priority then age, filtered by board, assignee, and category', async () => {
        const low = await create({ assignee: 'me', priority: 'low', title: 'Mine later' });
        const high = await create({ assignee: 'me', priority: 'high', title: 'Mine first' });
        const none = await create({ assignee: 'me', title: 'Mine unprioritized' });
        const mine = await call('/api/agent/tasks?assignee=me');
        expect(mine.status).toBe(200);
        expect(mine.body.omitted).toBe(0);
        expect(mine.body.tasks.map((task: { key: string }) => task.key)).toEqual([
            high.key,
            low.key,
            none.key,
        ]);

        await call('/api/agent/tasks/move', { column: 'Done', key: low.key });
        const open = await call('/api/agent/tasks?assignee=me');
        expect(open.body.tasks).toHaveLength(2);
        const done = await call('/api/agent/tasks?assignee=me&category=done');
        expect(done.body.tasks.map((task: { key: string }) => task.key)).toEqual([low.key]);

        const byHandle = await call('/api/agent/tasks?assignee=@ada');
        expect(byHandle.body.tasks.every((task: any) => task.assignee.handle === 'ada')).toBe(true);
        const unassigned = await call('/api/agent/tasks?assignee=none&board=GEN');
        expect(unassigned.body.tasks.every((task: any) => task.assignee === null)).toBe(true);
        expect((await call('/api/agent/tasks?category=nope')).status).toBe(400);
    });
});

describe('move, update, and assign', () => {
    test('a move answers with what is still waiting, and the current version by default', async () => {
        const peer = await fixture.mintRunner('run_agent_task_queue', fixture.peerAgentId);
        const first = await create({ assignee: '@peer', title: 'Queued one' });
        await create({ assignee: '@peer', title: 'Queued two' });
        const moved = await call(
            '/api/agent/tasks/move',
            { column: 'In progress', key: first.key },
            peer
        );
        expect(moved.status).toBe(200);
        expect(moved.body.queue).toEqual({ active: 1, todo: 1 });
        expect(moved.body.task).toMatchObject({ category: 'active', key: first.key, version: 2 });

        const stale = await call('/api/agent/tasks/move', {
            column: 'Done',
            expectedVersion: 1,
            key: first.key,
        });
        expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
        const elsewhere = await call('/api/agent/tasks/move', { column: 'Nope', key: first.key });
        expect(elsewhere.status).toBe(400);
        const missing = await call('/api/agent/tasks/move', { column: 'Done', key: 'GEN-999' });
        expect(missing).toMatchObject({ body: { code: 'TASK_NOT_FOUND' }, status: 404 });
    });

    test('update edits fields and clears a due date; an empty update is refused', async () => {
        const task = await create({ dueOn: '2026-12-24', title: 'Editable' });
        const updated = await call('/api/agent/tasks/update', {
            dueOn: null,
            key: task.key,
            labels: ['Security'],
            priority: 'medium',
            title: 'Edited',
        });
        expect(updated.body.task).toMatchObject({
            dueOn: null,
            labels: ['Security'],
            priority: 'medium',
            title: 'Edited',
            version: 2,
        });
        expect((await call('/api/agent/tasks/update', { key: task.key })).status).toBe(400);
    });

    test('assigning another Agent enqueues its wake; assigning yourself or a person does not', async () => {
        const task = await create({ title: 'Handed over' });
        const [row] = (await fixture.harness.sql`
            select id from tasks
            where server_id = ${fixture.serverId} and title = 'Handed over'
        `) as { id: string }[];
        const queued = async () =>
            await fixture.harness.sql`
                select dedupe_key from agent_inbox
                where source = 'task_assignment' and dedupe_key like ${`task-assign:${row?.id}:%`}
            `;
        const assigned = await call('/api/agent/tasks/assign', {
            assignee: '@peer',
            key: task.key,
        });
        expect(assigned.body.task.assignee).toEqual({ handle: 'peer', type: 'agent' });
        expect(
            await fixture.harness.sql`
                select agent_id, chat_id, mentioned from agent_inbox
                where dedupe_key = ${`task-assign:${row?.id}:2`}
            `
        ).toEqual([{ agent_id: fixture.peerAgentId, chat_id: null, mentioned: true }]);

        const taken = await call('/api/agent/tasks/assign', { assignee: 'me', key: task.key });
        expect(taken.body.task.assignee).toEqual({ handle: 'orbit', type: 'agent' });
        // Taking it back retires the peer's queued wake and queues nothing for the caller.
        expect(await queued()).toEqual([]);

        const cleared = await call('/api/agent/tasks/assign', { assignee: null, key: task.key });
        expect(cleared.body.task.assignee).toBeNull();
        expect((await call('/api/agent/tasks/assign', { key: task.key })).status).toBe(400);
    });
});

describe('show', () => {
    test('reads a Task with the messages and Reminders that reference it', async () => {
        const task = await create({ description: 'The whole story.', title: 'Referenced' });
        const sent = await call('/api/agent/messages/send', {
            content: `Picking up ${task.key} now.`,
            nonce: 'task_routes_ref',
            target: '#product',
        });
        expect(sent.body.state).toBe('sent');

        const shown = await call(`/api/agent/tasks/show?key=${task.key}`);
        expect(shown.status).toBe(200);
        expect(shown.body.description).toBe('The whole story.');
        expect(shown.body.task.key).toBe(task.key);
        expect(shown.body.reminders).toEqual([]);
        expect(shown.body.mentions).toEqual([
            expect.objectContaining({
                author: 'Orbit',
                excerpt: `Picking up ${task.key} now.`,
                target: '#product',
            }),
        ]);
        expect((await call('/api/agent/tasks/show?key=nope')).status).toBe(400);
        expect((await call('/api/agent/tasks/show?key=GEN-999')).status).toBe(404);
    });
});

describe('heartbeat runs', () => {
    test('read Tasks and boards but change nothing', async () => {
        const task = await create({ title: 'Seen by a heartbeat' });
        const runId = 'run_agent_task_heartbeat';
        await fixture.harness.sql`
            insert into agent_run_triggers (server_id, agent_id, run_id, source, work_id, chat_id)
            values (${fixture.serverId}, ${fixture.orbitAgentId}, ${runId}, 'heartbeat',
                ${`work:${runId}`}, null)
        `;
        const heartbeat = await fixture.mintRunner(runId, fixture.orbitAgentId, undefined, false);

        expect((await call('/api/agent/tasks', undefined, heartbeat)).status).toBe(200);
        expect((await call('/api/agent/boards', undefined, heartbeat)).status).toBe(200);
        for (const [path, body] of [
            ['/api/agent/tasks/create', { board: 'GEN', title: 'No' }],
            ['/api/agent/tasks/move', { column: 'Done', key: task.key }],
            ['/api/agent/tasks/update', { key: task.key, title: 'No' }],
            ['/api/agent/tasks/assign', { assignee: 'me', key: task.key }],
            ['/api/agent/boards/create', { key: 'HB', name: 'No' }],
            ['/api/agent/boards/columns', { board: 'GEN', columns: [] }],
        ] as const) {
            const refused = await call(path, body, heartbeat);
            // The empty column list fails validation first; every other write reaches the rule.
            expect(refused.status).toBe(path.endsWith('columns') ? 400 : 403);
            if (refused.status === 403) {
                expect(refused.body.code).toBe('REGULAR_TURN_REQUIRED');
            }
        }
    });

    test('a request without a runner credential is refused', async () => {
        const response = await fetch(new URL('/api/agent/tasks', fixture.harness.url));
        expect(response.status).toBe(401);
    });
});
