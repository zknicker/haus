import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let runner: { token: string };

async function call(path: string, body?: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: body === undefined ? 'GET' : 'POST',
    });
    return { body: (await response.json()) as Record<string, any>, status: response.status };
}

beforeAll(async () => {
    runner = await fixture.mintRunner('run_agent_board_routes');
});

test('lists boards with their columns and open counts, and creates one', async () => {
    const created = await call('/api/agent/boards/create', { key: 'SEC', name: 'Security' });
    expect(created.status).toBe(200);
    expect(created.body.board).toMatchObject({
        archivedAt: null,
        key: 'SEC',
        name: 'Security',
        openTaskCount: 0,
        version: 1,
    });
    expect(created.body.board).not.toHaveProperty('serverId');
    expect(
        created.body.board.columns.map((column: { category: string }) => column.category)
    ).toEqual(['backlog', 'todo', 'active', 'done', 'canceled']);

    await call('/api/agent/tasks/create', { board: 'SEC', title: 'Rotate the keys' });
    const listed = await call('/api/agent/boards');
    expect(listed.body.boards.map((board: { key: string }) => board.key)).toEqual(['GEN', 'SEC']);
    expect(listed.body.boards[1].openTaskCount).toBe(1);

    const duplicate = await call('/api/agent/boards/create', { key: 'SEC', name: 'Again' });
    expect(duplicate).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
    const invalid = await call('/api/agent/boards/create', { key: 'sec', name: 'Lower' });
    expect(invalid.status).toBe(400);
});

test('replaces a board column list by key, moving Tasks off a removed column', async () => {
    const { body } = await call('/api/agent/boards/create', { key: 'OPS', name: 'Ops' });
    const board = body.board as { columns: { category: string; id: string; name: string }[] };
    await call('/api/agent/tasks/create', { board: 'OPS', column: 'Backlog', title: 'Move me' });
    const [backlog, todo, ...rest] = board.columns;
    const kept = [todo, ...rest].map((column) => ({
        category: column?.category,
        id: column?.id,
        name: column?.name,
    }));

    const refused = await call('/api/agent/boards/columns', { board: 'OPS', columns: kept });
    expect(refused).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });

    const replaced = await call('/api/agent/boards/columns', {
        board: 'OPS',
        columns: [...kept, { category: 'todo', name: 'Next' }],
        moveTasks: { [backlog?.id ?? '']: todo?.id },
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.board.version).toBe(2);
    expect(replaced.body.board.columns.map((column: { name: string }) => column.name)).toEqual([
        'Todo',
        'In progress',
        'Done',
        'Canceled',
        'Next',
    ]);
    const moved = await call('/api/agent/tasks?board=OPS');
    expect(moved.body.tasks[0]).toMatchObject({ column: 'Todo', title: 'Move me' });

    const stale = await call('/api/agent/boards/columns', {
        board: 'OPS',
        columns: kept,
        expectedVersion: 1,
    });
    expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
    const missing = await call('/api/agent/boards/columns', { board: 'ZZZ', columns: kept });
    expect(missing).toMatchObject({ body: { code: 'BOARD_NOT_FOUND' }, status: 404 });
});
