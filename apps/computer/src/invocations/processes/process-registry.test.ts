import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessRegistry } from './process-registry.ts';

const task = 'agt_tasktasktasktask';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-process-registry-'));
    agentsRoot = join(root, 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('a revoke while a start is still on its way stops it before it spawns', async () => {
    const registry = createProcessRegistry({ agentsRoot, limit: 2, send: () => true });

    const starting = registry.start(request(new AbortController().signal));
    await registry.stopSession(task, { ending: 'revoked' });

    expect(await starting).toEqual({ kind: 'stopped' });
    expect(
        (await readdir(join(agentsRoot, task, 'runtime', 'processes'))).filter(isRecord)
    ).toEqual([]);
});

test('an aborted start never spawns', async () => {
    const registry = createProcessRegistry({ agentsRoot, limit: 2, send: () => true });
    const controller = new AbortController();

    const starting = registry.start(request(controller.signal));
    controller.abort('cancel');

    expect(await starting).toEqual({ kind: 'stopped' });
});

test('concurrent starts never pass the cap, and a refused or stopped start frees its slot', async () => {
    const registry = createProcessRegistry({ agentsRoot, limit: 1, send: () => true });
    const live = new AbortController().signal;

    const [first, second] = await Promise.all([
        registry.start(request(live)),
        registry.start(request(live)),
    ]);
    expect([first.kind, second.kind]).toEqual(['started', 'full']);
    if (first.kind !== 'started') {
        throw new Error('The first start did not start.');
    }
    await registry.kill(task, first.processId);

    expect((await registry.start(request(live))).kind).toBe('started');
    await registry.stopSession(task, { ending: 'revoked' });
});

function request(signal: AbortSignal) {
    return {
        agentId: task,
        command: 'sleep 30',
        cwd: root,
        env: { PATH: process.env.PATH ?? '' },
        runId: 'run-1',
        sessionGeneration: 1,
        signal,
    };
}

function isRecord(name: string) {
    return name.endsWith('.json');
}
