import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

let root: string;
let agentsRoot: string;
let counter: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-ledger-replay-'));
    agentsRoot = join(root, 'servers', 'server-1', 'agents');
    counter = join(root, 'counter');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('a resent invoke answers the stored result and runs the command once', async () => {
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));
    const frame = invoke(`printf 'ran\\n' >> ${counter}; echo hello`);

    handler.receive(frame);
    await handler.settled();
    handler.receive(frame);
    await handler.settled();

    const answer = [{ invocationId: 'inv-1', type: 'invoke-accepted' }, completedResult()];
    expect(frames).toEqual([...answer, ...answer]);
    expect(await readFile(counter, 'utf8')).toBe('ran\n');
});

test('two copies of an invoke that arrive together run the command once', async () => {
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));
    const frame = invoke(`printf 'ran\\n' >> ${counter}; echo hello`);

    handler.receive(frame);
    handler.receive(frame);
    await handler.settled();

    expect(frames).toEqual([
        { invocationId: 'inv-1', type: 'invoke-accepted' },
        { invocationId: 'inv-1', type: 'invoke-accepted' },
        completedResult(),
    ]);
    expect(await readFile(counter, 'utf8')).toBe('ran\n');
});

test('connected resends an unconfirmed result and not an acknowledged one', async () => {
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));
    handler.receive(invoke(`printf 'ran\\n' >> ${counter}; echo hello`));
    await handler.settled();

    await handler.connected();
    expect(frames).toEqual([
        { invocationId: 'inv-1', type: 'invoke-accepted' },
        completedResult(),
        completedResult(),
    ]);

    handler.receive({ invocationId: 'inv-1', type: 'invoke-result-ack' });
    await handler.settled();
    await handler.connected();
    const restarted: unknown[] = [];
    await (await createInvocationHandler(handlerInput(agentsRoot, restarted))).connected();

    expect(frames).toHaveLength(3);
    expect(restarted).toEqual([]);
    expect(await readFile(counter, 'utf8')).toBe('ran\n');
});

test('a result sent while disconnected goes out on the next connect', async () => {
    const frames: unknown[] = [];
    let online = false;
    const handler = await createInvocationHandler({
        ...handlerInput(agentsRoot, frames),
        send: (frame) => {
            if (online) {
                frames.push(frame);
            }
            return online;
        },
    });
    handler.receive(invoke('echo hello'));
    await handler.settled();
    expect(frames).toEqual([]);

    online = true;
    await handler.connected();

    expect(frames).toEqual([completedResult()]);
});

function invoke(command: string) {
    return {
        agentId: 'agent-1',
        invocationId: 'inv-1',
        operation: { command, kind: 'bash' },
        runId: 'run-1',
        timeoutMs: 30_000,
        type: 'invoke',
    };
}

function completedResult() {
    return {
        exitCode: 0,
        invocationId: 'inv-1',
        logPath: join(agentsRoot, 'agent-1', 'runtime', 'invocations', 'inv-1.log'),
        outcome: 'completed',
        output: { kind: 'text', text: 'hello\n' },
        truncated: false,
        type: 'invoke-result',
    };
}
