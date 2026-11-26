import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { InvokeResult } from '@haus/api';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

const fenced = 'agt_fencedfencedfenc';
const other = 'agt_otherotherothero';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-invocation-fence-'));
    agentsRoot = join(root, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test("a fence stops the Agent's running call, settles its queued one unrun, and leaves other Agents alone", async () => {
    const fifo = makeFifo('started');
    const counter = join(root, 'counter');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.receive(invoke(fenced, 'inv-1', `sleep 30 & echo started > ${fifo}; wait`));
    handler.receive(invoke(fenced, 'inv-2', `printf 'ran\\n' >> ${counter}`));
    expect(await readFile(fifo, 'utf8')).toBe('started\n');
    handler.receive({ agentId: fenced, type: 'agent-fence' });
    handler.receive(invoke(other, 'inv-3', 'printf still-here'));
    await handler.settled();

    expect(outcomes(frames)).toEqual([
        { invocationId: 'inv-1', outcome: 'cancelled', text: 'Command aborted' },
        { invocationId: 'inv-2', outcome: 'cancelled', text: 'Cancelled before it started.' },
        { invocationId: 'inv-3', outcome: 'completed', text: 'still-here' },
    ]);
    expect(await Bun.file(counter).exists()).toBe(false);
});

test('a fence resolves only after the fenced calls have finished, so retirement can purge after it', async () => {
    const fifo = makeFifo('started');
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.receive(invoke(fenced, 'inv-1', `sleep 30 & echo started > ${fifo}; wait`));
    handler.receive(invoke(fenced, 'inv-2', 'printf never'));
    expect(await readFile(fifo, 'utf8')).toBe('started\n');
    await handler.fence(fenced);

    expect(outcomes(frames).map(({ outcome }) => outcome)).toEqual(['cancelled', 'cancelled']);
    await handler.settled();
});

function invoke(agentId: string, invocationId: string, command: string) {
    return {
        agentId,
        invocationId,
        notAfter: '2999-01-01T00:00:00.000Z',
        operation: { command, kind: 'bash' },
        runId: 'run-1',
        sessionGeneration: 1,
        timeoutMs: 30_000,
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
        }))
        .sort((a, b) => a.invocationId.localeCompare(b.invocationId));
}

function makeFifo(name: string) {
    const path = join(root, name);
    expect(Bun.spawnSync(['mkfifo', path]).exitCode).toBe(0);
    return path;
}
