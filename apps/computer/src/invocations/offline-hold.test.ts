import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InvokeResult } from '@haus/api';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

const agentId = 'agt_heldheldheldheld';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-invocation-offline-'));
    agentsRoot = join(root, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('an accepted call does not start while the Computer is disconnected, and runs on reconnect', async () => {
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.disconnected();
    handler.receive(invoke('inv-1', 'printf ran'));
    await handler.settled();

    expect(frames.map(frameType)).toEqual(['invoke-accepted']);
    await handler.connected();
    await handler.settled();
    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'completed', text: 'ran' },
    ]);
});

test('a call running at the disconnect finishes, and the call queued behind it waits for the reconnect', async () => {
    const started = makeFifo('started');
    const gate = makeFifo('gate');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.receive(invoke('inv-1', `echo started > ${started}; read line < ${gate}; printf done`));
    handler.receive(invoke('inv-2', 'printf queued'));
    expect(await readFile(started, 'utf8')).toBe('started\n');
    handler.disconnected();
    await writeFile(gate, 'go\n');
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'completed', text: 'done' },
    ]);
    handler.receive({ invocationId: 'inv-1', type: 'invoke-result-ack' });
    await handler.settled();
    await handler.connected();
    await handler.settled();
    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'completed', text: 'done' },
        { invocationId: 'inv-2', outcome: 'completed', text: 'queued' },
    ]);
});

test('a fence while a call is held settles it cancelled without running and without a reconnect', async () => {
    const counter = join(root, 'counter');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.disconnected();
    handler.receive(invoke('inv-1', `printf 'ran\\n' >> ${counter}`));
    await handler.settled();
    handler.receive({ agentId, type: 'agent-fence' });
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'cancelled', text: 'Cancelled before it started.' },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

function invoke(invocationId: string, command: string) {
    return {
        agentId,
        invocationId,
        operation: { command, kind: 'bash' },
        runId: 'run-1',
        timeoutMs: 30_000,
        type: 'invoke',
    };
}

function frameType(frame: unknown) {
    return (frame as { type?: unknown }).type;
}

function outcomes(frames: unknown[]) {
    return frames
        .filter((frame): frame is InvokeResult => frameType(frame) === 'invoke-result')
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
