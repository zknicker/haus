import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { spawnClaudeProcess } from './claude-code/claude-process.ts';
import { runtimeProcessOwner, stopRuntimeProcesses } from './process-registry.ts';

test('daemon cleanup stops every registered runtime process and fences later spawns', async () => {
    const runtime = makeDaemonRuntime();
    const root = await mkdtemp(join(tmpdir(), 'haus-runtime-processes-'));
    const spawnSleeper = () =>
        spawnClaudeProcess({
            args: ['30'],
            binaryPath: 'sleep',
            cwd: root,
            env: { PATH: process.env.PATH ?? '' },
            processes: runtimeProcessOwner(runtime),
        });
    const children = [spawnSleeper(), spawnSleeper()];
    try {
        await Promise.all([stopRuntimeProcesses(runtime), stopRuntimeProcesses(runtime)]);
        for (const child of children) {
            expect(child.alive).toBe(false);
            expect(() => process.kill(child.pid as number, 0)).toThrow();
        }
        expect(spawnSleeper).toThrow('shutting down');
    } finally {
        await Promise.allSettled(children.map((child) => child.stop()));
        await runtime.dispose();
        await rm(root, { force: true, recursive: true });
    }
});
