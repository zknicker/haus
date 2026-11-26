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
        brief: 'Work it.',
        machine: fixture.computerId,
        ...body,
    });
    expect(started.status).toBe(200);
    return started.body.task as Record<string, any>;
}

const shortIdsOf = (reply: Reply) =>
    reply.body.tasks.map((task: { shortId: string }) => task.shortId);

beforeAll(async () => {
    runner = await fixture.mintRunner('run_agent_task_routes');
});

describe('start and list', () => {
    test('starts active with a short id and no backlog fields', async () => {
        const plain = await start({ title: 'Plain' });
        expect(plain).toMatchObject({
            archivedAt: null,
            createdBy: { handle: 'orbit', type: 'agent' },
            shortId: expect.stringMatching(/^[0-9a-hjkmnp-tv-z]{8}$/u),
            title: 'Plain',
            version: 1,
        });
        for (const field of ['assignee', 'state', 'priority', 'labels', 'dueOn', 'key']) {
            expect(plain).not.toHaveProperty(field);
        }
        const refused = await call('/api/agent/tasks/start', {
            from: 'msg_unused',
            priority: 'urgent',
            target: '#product',
            brief: 'Work it.',
            machine: fixture.computerId,
            title: 'Rich',
        });
        expect(refused.status).toBe(400);
    });

    test('starts from the short message id the inbox shows', async () => {
        const origin = await call('/api/agent/messages/send', {
            content: 'Short id origin',
            nonce: 'task_routes_short_origin',
            target: '#product',
        });
        const started = await call('/api/agent/tasks/start', {
            from: (origin.body.message.id as string).slice('msg_'.length, 'msg_'.length + 8),
            target: '#product',
            brief: 'Work it.',
            machine: fixture.computerId,
            title: 'From a short id',
        });
        expect(started.status).toBe(200);
        expect(started.body.task).toMatchObject({ title: 'From a short id' });
    });

    test('lists the caller’s active Tasks newest first, then archived ones, and one Project', async () => {
        const older = await start({ title: 'Mine earlier' });
        const newer = await start({ title: 'Mine later' });
        const mine = await call('/api/agent/tasks');
        expect(mine.status).toBe(200);
        expect(mine.body.omitted).toBe(0);
        const listed = shortIdsOf(mine);
        expect(listed.indexOf(newer.shortId)).toBeLessThan(listed.indexOf(older.shortId));

        await call('/api/agent/tasks/archive', { task: older.shortId });
        expect(shortIdsOf(await call('/api/agent/tasks'))).not.toContain(older.shortId);
        expect(shortIdsOf(await call('/api/agent/tasks?archived=true'))).toEqual([older.shortId]);

        const byProject = await call('/api/agent/tasks?all=true&project=PROD');
        expect(shortIdsOf(byProject)).toContain(newer.shortId);
        expect((await call('/api/agent/tasks?all=maybe')).status).toBe(400);
        expect((await call('/api/agent/tasks?project=ZZZ')).status).toBe(400);
    });
});

describe('archive', () => {
    test('takes the current version by default, refuses a stale one, and names unknown Tasks', async () => {
        const task = await start({ title: 'Archive me' });
        const stale = await call('/api/agent/tasks/archive', {
            expectedVersion: 7,
            task: task.shortId,
        });
        expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
        const archived = await call('/api/agent/tasks/archive', { task: task.shortId });
        expect(archived.status).toBe(200);
        expect(archived.body.task).toMatchObject({ shortId: task.shortId, version: 2 });
        expect(archived.body.task.archivedAt).not.toBeNull();
        const missing = await call('/api/agent/tasks/archive', { task: 'zzzz0999' });
        expect(missing).toMatchObject({ body: { code: 'TASK_NOT_FOUND' }, status: 404 });
        for (const removed of ['state', 'update', 'assign']) {
            const gone = await call(`/api/agent/tasks/${removed}`, { task: task.shortId });
            expect(gone.status).toBe(404);
        }
    });
});

describe('show', () => {
    test('reads a Task with the messages and Reminders that reference it', async () => {
        const task = await start({ title: 'Referenced' });
        const sent = await call('/api/agent/messages/send', {
            content: `Picking up [it](task://${task.shortId}) now.`,
            nonce: 'task_routes_ref',
            target: '#product',
        });
        expect(sent.body.state).toBe('sent');

        const shown = await call(`/api/agent/tasks/show?task=${task.shortId}`);
        expect(shown.status).toBe(200);
        expect(shown.body.description).toBe('');
        expect(shown.body.task.shortId).toBe(task.shortId);
        expect(shown.body.reminders).toEqual([]);
        expect(shown.body.mentions).toEqual([
            expect.objectContaining({ author: 'Orbit', target: '#product' }),
        ]);
        expect((await call('/api/agent/tasks/show')).status).toBe(400);
        expect((await call('/api/agent/tasks/show?task=zzzz0999')).status).toBe(404);
    });
});

describe('authorization', () => {
    test('a request without a runner credential is refused', async () => {
        const response = await fetch(new URL('/api/agent/tasks', fixture.harness.url));
        expect(response.status).toBe(401);
    });
});
