import { beforeAll, describe, expect, test } from 'bun:test';

import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let runner: { token: string };
let origins = 0;

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

async function start(body: Record<string, unknown>) {
    origins += 1;
    const origin = await call('/api/agent/messages/send', {
        content: `Work item ${origins}`,
        nonce: `task_routes_origin_${origins}`,
        target: '#product',
    });
    expect(origin.body.state).toBe('sent');
    const started = await call('/api/agent/tasks/start', {
        from: origin.body.message.id,
        target: '#product',
        ...body,
    });
    expect(started.status).toBe(200);
    return started.body.task as Record<string, any>;
}

beforeAll(async () => {
    runner = await fixture.mintRunner('run_agent_task_routes');
    await fixture.owner.trpc.taskLabel.create.mutate({
        name: 'Security',
        serverId: fixture.serverId,
    });
});

describe('start and list', () => {
    test('starts open, assigned to the caller, and resolves handles', async () => {
        const plain = await start({ title: 'Plain' });
        expect(plain).toMatchObject({
            assignee: { handle: 'orbit', type: 'agent' },
            createdBy: { handle: 'orbit', type: 'agent' },
            labels: [],
            priority: 'none',
            state: 'open',
            title: 'Plain',
            version: 1,
        });
        expect(plain).not.toHaveProperty('column');
        expect(plain).not.toHaveProperty('board');

        const rich = await start({
            assignee: '@ada',
            description: 'All of it.',
            dueOn: '2026-12-01',
            priority: 'urgent',
            state: 'todo',
            title: 'Rich',
        });
        expect(rich).toMatchObject({
            assignee: { handle: 'ada', type: 'human' },
            dueOn: '2026-12-01',
            priority: 'urgent',
            state: 'todo',
        });
    });

    test('lists unfinished Tasks by priority then age, filtered by assignee, key, and state', async () => {
        const low = await start({ priority: 'low', title: 'Mine later' });
        const high = await start({ priority: 'high', title: 'Mine first' });
        const none = await start({ title: 'Mine unprioritized' });
        const mine = await call('/api/agent/tasks?assignee=me');
        expect(mine.status).toBe(200);
        expect(mine.body.omitted).toBe(0);
        const keys = mine.body.tasks.map((task: { key: string }) => task.key);
        expect(keys.indexOf(high.key)).toBeLessThan(keys.indexOf(low.key));
        expect(keys.indexOf(low.key)).toBeLessThan(keys.indexOf(none.key));

        await call('/api/agent/tasks/state', { key: low.key, state: 'done' });
        const open = await call('/api/agent/tasks?assignee=me');
        expect(open.body.tasks.map((task: { key: string }) => task.key)).not.toContain(low.key);
        const done = await call('/api/agent/tasks?assignee=me&state=done');
        expect(done.body.tasks.map((task: { key: string }) => task.key)).toEqual([low.key]);

        const byHandle = await call('/api/agent/tasks?assignee=@ada');
        expect(byHandle.body.tasks.every((task: any) => task.assignee.handle === 'ada')).toBe(true);
        const byKey = await call('/api/agent/tasks?key=GEN');
        expect(byKey.body.tasks.length).toBeGreaterThan(0);
        expect((await call('/api/agent/tasks?state=nope')).status).toBe(400);
        expect((await call('/api/agent/tasks?key=ZZZ')).status).toBe(404);
    });
});

describe('state, update, and assign', () => {
    test('a state change takes the current version by default and refuses a stale one', async () => {
        const task = await start({ title: 'Moving' });
        const moved = await call('/api/agent/tasks/state', { key: task.key, state: 'done' });
        expect(moved.status).toBe(200);
        expect(moved.body.task).toMatchObject({ key: task.key, state: 'done', version: 2 });
        expect(moved.body.task.completedAt).not.toBeNull();

        const stale = await call('/api/agent/tasks/state', {
            expectedVersion: 1,
            key: task.key,
            state: 'open',
        });
        expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
        const missing = await call('/api/agent/tasks/state', { key: 'GEN-999', state: 'done' });
        expect(missing).toMatchObject({ body: { code: 'TASK_NOT_FOUND' }, status: 404 });
    });

    test('update edits fields and clears a due date; an empty update is refused', async () => {
        const task = await start({ dueOn: '2026-12-24', title: 'Editable' });
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
        const label = await call('/api/agent/tasks/update', { key: task.key, labels: ['nope'] });
        expect(label.status).toBe(400);
    });

    test('assigning another Agent enqueues its wake; assigning yourself or a person does not', async () => {
        const task = await start({ title: 'Handed over' });
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

        const nobody = await call('/api/agent/tasks/assign', {
            assignee: '@nobody',
            key: task.key,
        });
        expect(nobody).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
        expect(nobody.body.message).toContain('@nobody');
        const cleared = await call('/api/agent/tasks/assign', { assignee: null, key: task.key });
        expect(cleared.body.task.assignee).toBeNull();
        expect((await call('/api/agent/tasks/assign', { key: task.key })).status).toBe(400);
    });
});

describe('show', () => {
    test('reads a Task with the messages and Reminders that reference it', async () => {
        const task = await start({ description: 'The whole story.', title: 'Referenced' });
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

describe('authorization', () => {
    test('a request without a runner credential is refused', async () => {
        const response = await fetch(new URL('/api/agent/tasks', fixture.harness.url));
        expect(response.status).toBe(401);
    });
});
