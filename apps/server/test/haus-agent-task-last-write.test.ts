import { beforeAll, expect, test } from 'bun:test';
import { implicitVersionAttempts, withImplicitVersion } from '../src/agent-api/task-route-shell.ts';
import { BoardConflictError } from '../src/boards/board-errors.ts';
import { TaskConflictError, TaskInvariantError } from '../src/tasks/task-errors.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

/** Agent writes without `expectedVersion`: the last write wins; with one, they fail closed. */
const fixture = agentCreationFixture();
let runner: { token: string };

async function call(path: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return { body: (await response.json()) as Record<string, any>, status: response.status };
}

beforeAll(async () => {
    runner = await fixture.mintRunner('run_task_last_write');
});

test('a write that lost the race reads again and retries, up to the bound', async () => {
    const seen: number[] = [];
    let current = 1;
    const result = await withImplicitVersion(
        undefined,
        () => Promise.resolve(current),
        (version) => {
            seen.push(version);
            if (seen.length < 3) {
                current += 1;
                throw new TaskConflictError(current, version);
            }
            return Promise.resolve('written');
        }
    );
    expect(result).toBe('written');
    expect(seen).toEqual([1, 2, 3]);

    let attempts = 0;
    await expect(
        withImplicitVersion(
            undefined,
            () => Promise.resolve(1),
            () => {
                attempts += 1;
                throw new BoardConflictError('The board changed.');
            }
        )
    ).rejects.toBeInstanceOf(BoardConflictError);
    expect(attempts).toBe(implicitVersionAttempts);
});

test('an explicit version fails closed, and only a lost race retries', async () => {
    let attempts = 0;
    const conflict = () => {
        attempts += 1;
        throw new TaskConflictError(2, 1);
    };
    await expect(withImplicitVersion(1, () => Promise.resolve(2), conflict)).rejects.toBeInstanceOf(
        TaskConflictError
    );
    expect(attempts).toBe(1);

    attempts = 0;
    await expect(
        withImplicitVersion(
            undefined,
            () => Promise.resolve(1),
            () => {
                attempts += 1;
                throw new TaskInvariantError('Refused.');
            }
        )
    ).rejects.toBeInstanceOf(TaskInvariantError);
    expect(attempts).toBe(1);
});

test('concurrent implicit writes to one Task all land', async () => {
    const created = await call('/api/agent/tasks/create', { board: 'GEN', title: 'Contended' });
    const { key } = created.body.task as { key: string };

    const writes = await Promise.all([
        call('/api/agent/tasks/update', { key, title: 'One' }),
        call('/api/agent/tasks/update', { key, priority: 'high' }),
        call('/api/agent/tasks/move', { column: 'In progress', key }),
        call('/api/agent/tasks/assign', { assignee: 'me', key }),
        call('/api/agent/tasks/update', { dueOn: '2026-12-01', key }),
    ]);
    expect(writes.map((write) => write.status)).toEqual([200, 200, 200, 200, 200]);
    const stale = await call('/api/agent/tasks/update', { expectedVersion: 1, key, title: 'Lost' });
    expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
});

test('concurrent implicit column writes to one board all land; a stale one fails closed', async () => {
    const created = await call('/api/agent/boards/create', { key: 'RACE', name: 'Race' });
    const columns = (
        created.body.board.columns as { category: string; id: string; name: string }[]
    ).map(({ category, id, name }) => ({ category, id, name }));

    const writes = await Promise.all(
        ['Later', 'Soon', 'Maybe'].map((name) =>
            call('/api/agent/boards/columns', {
                board: 'RACE',
                columns: [...columns, { category: 'backlog', name }],
            })
        )
    );
    expect(writes.map((write) => write.status)).toEqual([200, 200, 200]);

    const stale = await call('/api/agent/boards/columns', {
        board: 'RACE',
        columns,
        expectedVersion: 1,
    });
    expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
});
