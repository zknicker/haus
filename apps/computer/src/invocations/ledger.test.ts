import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';
import { createLedger, finishedRecord } from './ledger.ts';

const hourMs = 60 * 60 * 1000;

let root: string;
let agentsRoot: string;
let directory: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-ledger-'));
    agentsRoot = join(root, 'servers', 'server-1', 'agents');
    directory = join(agentsRoot, 'agent-1', 'runtime', 'invocations');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('connect prunes records confirmed over a day ago and logs over a week old', async () => {
    const ledger = createLedger(agentsRoot);
    const now = Date.now();
    await ledger.write(finished('inv-old', new Date(now - 25 * hourMs).toISOString()));
    await ledger.write(finished('inv-recent', new Date(now - 23 * hourMs).toISOString()));
    await ledger.write(finished('inv-unconfirmed', undefined));
    await writeFile(join(directory, 'inv-old.log'), 'old');
    await writeFile(join(directory, 'inv-recent.log'), 'recent');
    const eightDaysAgo = new Date(now - 8 * 24 * hourMs);
    await utimes(join(directory, 'inv-old.log'), eightDaysAgo, eightDaysAgo);

    const frames: unknown[] = [];
    await (await createInvocationHandler(handlerInput(agentsRoot, frames))).connected();

    expect((await readdir(directory)).sort()).toEqual([
        'inv-recent.json',
        'inv-recent.log',
        'inv-unconfirmed.json',
    ]);
    expect(frames).toEqual([result('inv-unconfirmed')]);
});

test('a record that fails validation stops the handler from starting', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'inv-1.json'), JSON.stringify({ state: 'running' }));

    await expect(createInvocationHandler(handlerInput(agentsRoot, []))).rejects.toThrow(
        `Invocation ledger record ${join(directory, 'inv-1.json')} is invalid`
    );
});

test('a write leaves only the record behind', async () => {
    await createLedger(agentsRoot).write(finished('inv-1', undefined));

    expect(await readdir(directory)).toEqual(['inv-1.json']);
    expect(await createLedger(agentsRoot).read('agent-1', 'inv-1')).toEqual(
        finished('inv-1', undefined)
    );
});

function finished(invocationId: string, confirmedAt: string | undefined) {
    const record = finishedRecord(
        {
            acceptedAt: '2026-11-19T12:00:00.000Z',
            agentId: 'agent-1',
            invocationId,
            operationKind: 'bash',
            runId: 'run-1',
            state: 'accepted',
        },
        result(invocationId),
        '2026-11-19T12:00:01.000Z'
    );
    return confirmedAt === undefined ? record : { ...record, confirmedAt };
}

function result(invocationId: string) {
    return {
        exitCode: 0,
        invocationId,
        outcome: 'completed' as const,
        output: { kind: 'text' as const, text: 'done\n' },
        truncated: false,
        type: 'invoke-result' as const,
    };
}
