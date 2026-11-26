import { afterEach, beforeEach, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInvocationHandler } from '../handler.ts';
import { frameSink, invokeFrame } from '../session-frames.test-support.ts';
import { createProcessRecords } from './process-records.ts';

const task = 'agt_tasktasktasktask';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-processes-'));
    agentsRoot = join(root, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('a background process outlives its call, reads from a cursor, and reports its exit until acknowledged', async () => {
    const go = makeFifo('go');
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler(sink.input);

    const processId = await startBackground(
        handler,
        sink,
        'inv-1',
        `echo first; cat ${go}; echo second; exit 3`
    );
    const exit = sink.next('process-exit');
    await writeFile(go, 'go\n');
    expect(await exit).toMatchObject({
        agentId: task,
        cursor: 'first\ngo\nsecond\n'.length,
        exitCode: 3,
        processId,
        sessionGeneration: 1,
        tail: 'first\ngo\nsecond\n',
    });
    handler.receive(invokeFrame(task, 'inv-2', { afterSeq: 6, kind: 'process-read', processId }));
    await handler.settled();
    expect(sink.results().at(-1)).toEqual({
        invocationId: 'inv-2',
        outcome: 'completed',
        text: `go\nsecond\n\n[${processId} exited with code 3 · next afterSeq 16]`,
    });

    await handler.connected();
    expect(sink.exits()).toHaveLength(2);
    handler.receive({ processId, type: 'process-exit-ack' });
    await handler.settled();
    await handler.connected();
    expect(sink.exits()).toHaveLength(2);
});

test('a process its own session kills reports nothing, and another session cannot reach it', async () => {
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler(sink.input);
    const processId = await startBackground(handler, sink, 'inv-1', 'sleep 30');

    handler.receive(
        invokeFrame('agt_otherotherothero', 'inv-2', { kind: 'process-kill', processId })
    );
    handler.receive(invokeFrame(task, 'inv-3', { kind: 'process-kill', processId }));
    await handler.settled();

    const kills = sink.results().filter(({ invocationId }) => invocationId !== 'inv-1');
    expect(kills.sort((a, b) => a.invocationId.localeCompare(b.invocationId))).toEqual([
        { invocationId: 'inv-2', outcome: 'failed', text: `${processId} is not running.` },
        { invocationId: 'inv-3', outcome: 'completed', text: `Ended ${processId}.` },
    ]);
    expect(sink.exits()).toEqual([]);
});

test('an archive kills older generations silently, and a revoke kills and reports', async () => {
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler(sink.input);
    const archived = await startBackground(handler, sink, 'inv-1', 'sleep 30', 1);
    const revoked = await startBackground(handler, sink, 'inv-2', 'sleep 30', 2);

    handler.receive({ agentId: task, generation: 2, type: 'task-archive' });
    await handler.settled();
    expect(sink.exits()).toEqual([]);
    await handler.fence(task);

    expect(sink.exits().map(({ processId }) => processId)).toEqual([revoked]);
    expect((await createProcessRecords(agentsRoot).read(task, archived))?.ending).toBe('archived');
});

test('the Computer refuses a background process past its cap', async () => {
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler({ ...sink.input, processLimit: 1 });
    const processId = await startBackground(handler, sink, 'inv-1', 'sleep 30');

    handler.receive(
        invokeFrame(task, 'inv-2', { background: true, command: 'true', kind: 'bash' })
    );
    await handler.settled();
    expect(sink.results().at(-1)).toEqual({
        invocationId: 'inv-2',
        outcome: 'failed',
        text: 'This Computer already runs 1 background processes. End one with process_kill first.',
    });
    handler.receive(invokeFrame(task, 'inv-3', { kind: 'process-kill', processId }));
    await handler.settled();
});

test('a process the Computer lost on restart is ended and reported once it reconnects', async () => {
    const records = createProcessRecords(agentsRoot);
    const processId = 'prc_lostlostlostlost';
    const orphan = spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' });
    await mkdir(records.directory(task), { recursive: true });
    await writeFile(records.logPath(task, processId), 'hi\n');
    await records.write({
        agentId: task,
        command: 'sleep 30',
        ending: null,
        exitCode: null,
        exitedAt: null,
        pid: orphan.pid ?? null,
        processId,
        reportedAt: null,
        runId: 'run-1',
        sessionGeneration: 1,
        startedAt: new Date().toISOString(),
    });
    const exited = new Promise((resolve) => orphan.once('exit', resolve));

    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler(sink.input);
    await handler.connected();

    expect(sink.exits()).toEqual([
        expect.objectContaining({ cursor: 3, exitCode: null, processId, tail: 'hi\n' }),
    ]);
    expect(await exited).not.toBeUndefined();
});

async function startBackground(
    handler: Awaited<ReturnType<typeof createInvocationHandler>>,
    sink: ReturnType<typeof frameSink>,
    invocationId: string,
    command: string,
    generation = 1
) {
    handler.receive(
        invokeFrame(task, invocationId, { background: true, command, kind: 'bash' }, generation)
    );
    await handler.settled();
    const started = sink.results().find((result) => result.invocationId === invocationId);
    const processId = started?.text.match(/prc_[A-Za-z0-9_-]{16}/u)?.[0];
    if (!processId) {
        throw new Error(`No process started: ${JSON.stringify(started)}`);
    }
    return processId;
}

function makeFifo(name: string) {
    const path = join(root, name);
    expect(Bun.spawnSync(['mkfifo', path]).exitCode).toBe(0);
    return path;
}
