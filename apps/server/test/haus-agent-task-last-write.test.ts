import { beforeAll, expect, test } from 'bun:test';
import { implicitVersionAttempts, withImplicitVersion } from '../src/agent-api/task-route-shell.ts';
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
                throw new TaskConflictError(2, 1);
            }
        )
    ).rejects.toBeInstanceOf(TaskConflictError);
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
    const origin = await call('/api/agent/messages/send', {
        content: 'Contended work',
        nonce: 'task_last_write_origin',
        target: '#product',
    });
    const started = await call('/api/agent/tasks/start', {
        brief: 'Contended work.',
        from: origin.body.message.id,
        machine: fixture.computerId,
        target: '#product',
        title: 'Contended',
    });
    const { shortId } = started.body.task as { shortId: string };

    const writes = await Promise.all([
        call('/api/agent/tasks/archive', { task: shortId }),
        call('/api/agent/tasks/archive', { task: shortId }),
        call('/api/agent/tasks/archive', { task: shortId }),
    ]);
    expect(writes.map((write) => write.status)).toEqual([200, 200, 200]);
    expect(writes.every((write) => write.body.task.archivedAt !== null)).toBe(true);
    const stale = await call('/api/agent/tasks/archive', { expectedVersion: 1, task: shortId });
    expect(stale).toMatchObject({ body: { code: 'TASK_CONFLICT' }, status: 409 });
});
