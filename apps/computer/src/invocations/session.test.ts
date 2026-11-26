import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInvocationHandler } from './handler.ts';
import { frameSink, invokeFrame } from './session-frames.test-support.ts';

const task = 'agt_tasktasktasktask';
const captain = 'agt_captaincaptainca';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-invocation-session-'));
    agentsRoot = join(root, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('sessions past the per-Computer cap wait for a slot, then run', async () => {
    const started = makeFifo('started');
    const go = makeFifo('go');
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler({ ...sink.input, invocationLimit: 1 });

    handler.receive(invokeFrame(task, 'inv-1', bash(`echo up > ${started}; cat ${go}`)));
    expect(await readFile(started, 'utf8')).toBe('up\n');
    handler.receive(invokeFrame(captain, 'inv-2', bash('printf second')));
    await writeFile(go, 'done\n');
    await handler.settled();

    expect(sink.results().map(({ invocationId }) => invocationId)).toEqual(['inv-1', 'inv-2']);
});

test('sessions run in parallel under the cap', async () => {
    const started = makeFifo('started');
    const go = makeFifo('go');
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler({ ...sink.input, invocationLimit: 2 });

    handler.receive(invokeFrame(task, 'inv-1', bash(`echo up > ${started}; cat ${go}`)));
    expect(await readFile(started, 'utf8')).toBe('up\n');
    handler.receive(invokeFrame(captain, 'inv-2', bash('printf second')));
    const second = await sink.next('invoke-result');
    await writeFile(go, 'done\n');
    await handler.settled();

    expect(second).toMatchObject({ invocationId: 'inv-2', outcome: 'completed' });
});

test('an archive refuses older generations across restarts and runs newer ones', async () => {
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler(sink.input);

    handler.receive({ agentId: task, generation: 2, type: 'task-archive' });
    await handler.settled();
    handler.receive(invokeFrame(task, 'inv-1', bash('printf stale'), 1));
    handler.receive(invokeFrame(task, 'inv-2', bash('printf fresh'), 2));
    await handler.settled();
    const restarted = frameSink(agentsRoot);
    const again = await createInvocationHandler(restarted.input);
    again.receive(invokeFrame(task, 'inv-3', bash('printf stale'), 1));
    await again.settled();

    expect(
        [...sink.results(), ...restarted.results()].sort((a, b) =>
            a.invocationId.localeCompare(b.invocationId)
        )
    ).toEqual([
        {
            invocationId: 'inv-1',
            outcome: 'cancelled',
            text: 'This session was archived, so nothing ran.',
        },
        { invocationId: 'inv-2', outcome: 'completed', text: 'fresh' },
        {
            invocationId: 'inv-3',
            outcome: 'cancelled',
            text: 'This session was archived, so nothing ran.',
        },
    ]);
});

test("an archive stops the older generation's running call and leaves other sessions alone", async () => {
    const started = makeFifo('started');
    const sink = frameSink(agentsRoot);
    const handler = await createInvocationHandler(sink.input);

    handler.receive(invokeFrame(task, 'inv-1', bash(`sleep 30 & echo up > ${started}; wait`), 1));
    expect(await readFile(started, 'utf8')).toBe('up\n');
    handler.receive({ agentId: task, generation: 2, type: 'task-archive' });
    handler.receive(invokeFrame(captain, 'inv-2', bash('printf still-here')));
    await handler.settled();

    expect(sink.results().sort((a, b) => a.invocationId.localeCompare(b.invocationId))).toEqual([
        { invocationId: 'inv-1', outcome: 'cancelled', text: 'Command aborted' },
        { invocationId: 'inv-2', outcome: 'completed', text: 'still-here' },
    ]);
});

function bash(command: string) {
    return { command, kind: 'bash' };
}

function makeFifo(name: string) {
    const path = join(root, name);
    expect(Bun.spawnSync(['mkfifo', path]).exitCode).toBe(0);
    return path;
}
