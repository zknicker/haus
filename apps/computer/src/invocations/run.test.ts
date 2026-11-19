import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InvokeResult } from '@haus/api';
import { cancelKillGraceMs } from './bash.ts';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-invocation-run-'));
    agentsRoot = join(root, 'servers', 'server-1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('a timeout kills the process group and returns partial output', async () => {
    const pidFile = join(root, 'grandchild.pid');
    const { frames, handler } = await start();

    handler.receive(invoke('inv-1', `sleep 30 & echo $! > ${pidFile}; echo partial; wait`, 1000));
    await handler.settled();

    expect(results(frames)).toEqual([
        textResult('inv-1', 'timed-out', 'partial\n\n\nCommand timed out after 1 seconds'),
    ]);
    expect(processState(Number(await readFile(pidFile, 'utf8')))).toBe('gone');
});

test('a cancel stops a running command and returns partial output', async () => {
    const fifo = makeFifo('started');
    const pidFile = join(root, 'grandchild.pid');
    const { frames, handler } = await start();

    handler.receive(
        invoke(
            'inv-1',
            `echo partial; sleep 30 & echo $! > ${pidFile}; echo started > ${fifo}; wait`
        )
    );
    expect(await readFile(fifo, 'utf8')).toBe('started\n');
    handler.receive({ invocationId: 'inv-1', type: 'invoke-cancel' });
    await handler.settled();

    expect(results(frames)).toEqual([
        textResult('inv-1', 'cancelled', 'partial\n\n\nCommand aborted'),
    ]);
    expect(processState(Number(await readFile(pidFile, 'utf8')))).toBe('gone');
});

test('a cancel kills a command that ignores SIGTERM after the grace', async () => {
    const fifo = makeFifo('started');
    const { frames, handler } = await start();

    handler.receive(invoke('inv-1', `trap '' TERM; sleep 30 & echo started > ${fifo}; wait`));
    expect(await readFile(fifo, 'utf8')).toBe('started\n');
    const cancelledAt = performance.now();
    handler.receive({ invocationId: 'inv-1', type: 'invoke-cancel' });
    await handler.settled();

    expect(results(frames)).toEqual([textResult('inv-1', 'cancelled', 'Command aborted')]);
    expect(performance.now() - cancelledAt).toBeGreaterThanOrEqual(cancelKillGraceMs);
});

test('a cancel of a queued invocation finishes it without running it', async () => {
    const fifo = makeFifo('started');
    const counter = join(root, 'counter');
    const { frames, handler } = await start();

    handler.receive(invoke('inv-1', `sleep 30 & echo started > ${fifo}; wait`));
    handler.receive(invoke('inv-2', `printf 'ran\\n' >> ${counter}`));
    expect(await readFile(fifo, 'utf8')).toBe('started\n');
    handler.receive({ invocationId: 'inv-2', type: 'invoke-cancel' });
    handler.receive({ invocationId: 'inv-1', type: 'invoke-cancel' });
    await handler.settled();

    expect(results(frames)).toEqual([
        textResult('inv-1', 'cancelled', 'Command aborted'),
        {
            invocationId: 'inv-2',
            outcome: 'cancelled',
            output: { kind: 'text', text: 'Cancelled before it started.' },
            truncated: false,
            type: 'invoke-result',
        },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

test("one Agent's invocations run one at a time in arrival order", async () => {
    const gate = makeFifo('gate');
    const order = join(root, 'order');
    const { frames, handler } = await start();

    handler.receive(invoke('inv-1', `cat ${gate} > /dev/null; printf 1 >> ${order}`));
    handler.receive(invoke('inv-2', `printf 2 >> ${order}`));
    handler.receive(invoke('inv-3', `printf 3 >> ${order}`));
    await writeFile(gate, 'go');
    await handler.settled();

    expect(await readFile(order, 'utf8')).toBe('123');
    expect(results(frames).map((frame) => frame.invocationId)).toEqual(['inv-1', 'inv-2', 'inv-3']);
});

test('output over 2,000 lines returns the tail and keeps the full log', async () => {
    const { frames, handler } = await start();

    handler.receive(invoke('inv-1', 'seq 1 3000'));
    await handler.settled();

    const logPath = invocationLog('inv-1');
    const tail = Array.from({ length: 2000 }, (_, index) => index + 1001).join('\n');
    expect(results(frames)).toEqual([
        {
            exitCode: 0,
            invocationId: 'inv-1',
            logPath,
            outcome: 'completed',
            output: {
                kind: 'text',
                text: `${tail}\n\n[Showing lines 1001-3000 of 3000. Full output: ${logPath}]`,
            },
            truncated: true,
            type: 'invoke-result',
        },
    ]);
    const full = Array.from({ length: 3000 }, (_, index) => index + 1).join('\n');
    expect(await readFile(logPath, 'utf8')).toBe(`${full}\n`);
});

test('a timeout above the maximum is clamped and the result says so', async () => {
    const { frames, handler } = await start();

    handler.receive({
        ...invoke('inv-1', 'unused'),
        operation: { kind: 'file-read', maxBytes: 10, path: 'missing.txt' },
        timeoutMs: 600_000,
    });
    await handler.settled();

    const [result] = results(frames);
    expect(result?.output).toEqual({
        kind: 'text',
        text: expect.stringMatching(/\n\nTimeout clamped to 60 seconds\.$/u),
    });
});

async function start() {
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));
    return { frames, handler };
}

function makeFifo(name: string) {
    const path = join(root, name);
    expect(Bun.spawnSync(['mkfifo', path]).exitCode).toBe(0);
    return path;
}

function results(frames: unknown[]) {
    return frames.filter(
        (frame): frame is InvokeResult => (frame as { type?: unknown }).type === 'invoke-result'
    );
}

function invoke(invocationId: string, command: string, timeoutMs = 30_000) {
    return {
        agentId: 'agent-1',
        invocationId,
        operation: { command, kind: 'bash' },
        runId: 'run-1',
        timeoutMs,
        type: 'invoke',
    };
}

function invocationLog(invocationId: string) {
    return join(agentsRoot, 'agent-1', 'runtime', 'invocations', `${invocationId}.log`);
}

function textResult(invocationId: string, outcome: InvokeResult['outcome'], text: string) {
    return {
        invocationId,
        logPath: invocationLog(invocationId),
        outcome,
        output: { kind: 'text', text },
        truncated: false,
        type: 'invoke-result',
    } satisfies InvokeResult;
}

function processState(pid: number) {
    const state = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(pid)])
        .stdout.toString()
        .trim();
    return state === '' || state.startsWith('Z') ? 'gone' : state;
}
