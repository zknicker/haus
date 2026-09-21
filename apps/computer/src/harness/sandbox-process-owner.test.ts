import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { stopSandboxProcesses } from './sandbox-process-owner.ts';
import { createSandboxProcessRegistry } from './sandbox-processes.ts';

test('daemon cleanup reaps detached registries and fences late sandbox creation and spawns', async () => {
    const runtime = makeDaemonRuntime();
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-owner-'));
    const options = {
        defaultWorkingDirectory: root,
        env: {},
        resolveWorkingDirectory: (value: string) => value,
        runtime,
    };
    const first = createSandboxProcessRegistry(options);
    const second = createSandboxProcessRegistry(options);
    try {
        const children = await Promise.all([
            first.spawn({ command: 'sleep 30' }),
            second.spawn({ command: 'sleep 30' }),
        ]);
        await Promise.all([stopSandboxProcesses(runtime), stopSandboxProcesses(runtime)]);
        for (const child of children) {
            expect(() => process.kill(child.pid!, 0)).toThrow();
        }
        expect(() => createSandboxProcessRegistry(options)).toThrow('shutting down');
        await expect(first.spawn({ command: 'sleep 30' })).rejects.toThrow('shutting down');
    } finally {
        await Promise.allSettled([first.destroy(), second.destroy()]);
        await runtime.dispose();
        await rm(root, { force: true, recursive: true });
    }
});
