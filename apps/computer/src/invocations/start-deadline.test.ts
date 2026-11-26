import { afterEach, beforeEach, expect, setSystemTime, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, watch, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InvokeResult } from '@haus/api';
import { withAgentCleanup } from '../repos/agent-use.ts';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

const agentId = 'agt_deadlinedeadline';
const requestedAt = Date.parse('2026-11-26T12:00:00.000Z');
const pastDeadline = requestedAt + 35_000;
const notStarted = 'Cancelled before it started.';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    setSystemTime(requestedAt);
    root = await mkdtemp(join(tmpdir(), 'haus-invocation-deadline-'));
    agentsRoot = join(root, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    setSystemTime();
    await rm(root, { force: true, recursive: true });
});

test('a call held offline until past its deadline never runs on reconnect', async () => {
    const counter = join(root, 'counter');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.disconnected();
    handler.receive(invoke('inv-1', `printf ran >> ${counter}`));
    await handler.settled();
    setSystemTime(pastDeadline);
    await handler.connected();
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'cancelled', text: notStarted },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

test('a call queued behind a slow one until past its deadline never runs', async () => {
    const started = makeFifo('started');
    const gate = makeFifo('gate');
    const counter = join(root, 'counter');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.receive(invoke('inv-1', `echo started > ${started}; read line < ${gate}; printf done`));
    handler.receive(invoke('inv-2', `printf ran >> ${counter}`));
    expect(await readFile(started, 'utf8')).toBe('started\n');
    setSystemTime(pastDeadline);
    await writeFile(gate, 'go\n');
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'completed', text: 'done' },
        { invocationId: 'inv-2', outcome: 'cancelled', text: notStarted },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

test('the expiry cancel drops a queued call and leaves a running one to report late', async () => {
    const started = makeFifo('started');
    const gate = makeFifo('gate');
    const counter = join(root, 'counter');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.receive(invoke('inv-1', `echo started > ${started}; read line < ${gate}; printf done`));
    handler.receive(invoke('inv-2', `printf ran >> ${counter}`));
    expect(await readFile(started, 'utf8')).toBe('started\n');
    handler.receive({ dropIfNotStarted: true, invocationId: 'inv-1', type: 'invoke-cancel' });
    handler.receive({ dropIfNotStarted: true, invocationId: 'inv-2', type: 'invoke-cancel' });
    await writeFile(gate, 'go\n');
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'completed', text: 'done' },
        { invocationId: 'inv-2', outcome: 'cancelled', text: notStarted },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

test('a call past its deadline while it waits on worktree cleanup never runs', async () => {
    const { counter, frames, handler, releaseCleanup } = await callWaitingOnCleanup();

    setSystemTime(pastDeadline);
    releaseCleanup();
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'cancelled', text: notStarted },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

test('the expiry cancel drops a call that waits on worktree cleanup', async () => {
    const { counter, frames, handler, releaseCleanup } = await callWaitingOnCleanup();

    handler.receive({ dropIfNotStarted: true, invocationId: 'inv-1', type: 'invoke-cancel' });
    releaseCleanup();
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'cancelled', text: notStarted },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

async function callWaitingOnCleanup() {
    const counter = join(root, 'counter');
    const agentRoot = join(agentsRoot, agentId);
    await mkdir(agentRoot, { recursive: true });
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));
    const cleanup = Promise.withResolvers<void>();
    const cleaning = withAgentCleanup(agentId, () => cleanup.promise);
    const preparing = watch(agentRoot);

    handler.receive(invoke('inv-1', `printf ran >> ${counter}`));
    for await (const change of preparing) {
        if (change.filename === 'home') {
            break;
        }
    }
    return {
        counter,
        frames,
        handler,
        releaseCleanup: () => {
            cleanup.resolve();
            return cleaning;
        },
    };
}

function invoke(invocationId: string, command: string) {
    return {
        agentId,
        invocationId,
        notAfter: new Date(pastDeadline).toISOString(),
        operation: { command, kind: 'bash' },
        runId: 'run-1',
        sessionGeneration: 1,
        timeoutMs: 5000,
        type: 'invoke',
    };
}

function outcomes(frames: unknown[]) {
    return frames
        .filter(
            (frame): frame is InvokeResult => (frame as { type?: unknown }).type === 'invoke-result'
        )
        .map(({ invocationId, outcome, output }) => ({
            invocationId,
            outcome,
            text: output.kind === 'text' ? output.text : output.kind,
        }));
}

function makeFifo(name: string) {
    const path = join(root, name);
    expect(Bun.spawnSync(['mkfifo', path]).exitCode).toBe(0);
    return path;
}
