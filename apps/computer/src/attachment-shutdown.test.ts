import { expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import {
    stopAttachmentProcess,
    withAttachmentShutdown,
    withShutdownDeadline,
} from './attachment-shutdown.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { fakeHdiutil } from './workspace-volumes/disk-fixtures.ts';

// Run the real signal handler in another OS process: this test process must survive SIGTERM.
test('SIGTERM drains writers and reaps a detached harness tree before daemon exit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-daemon-shutdown-'));
    const source = join(root, 'daemon.ts');
    const childFile = join(root, 'child.cjs');
    const ready = join(root, 'ready.json');
    const saved = join(root, 'saved');
    const module = (file: string) => JSON.stringify(new URL(file, import.meta.url).pathname);
    await writeFile(childFile, 'setInterval(() => console.error("alive"), 10);');
    await writeFile(
        source,
        `
        import { writeFile } from 'node:fs/promises';
        import { AttachmentDaemonWork } from ${module('./attachment-daemon-work.ts')};
        import { makeDaemonRuntime } from ${module('./daemon-runtime.ts')};
        import { withAttachmentShutdown } from ${module('./attachment-shutdown.ts')};
        import { createSandboxProcessRegistry } from ${module('./harness/sandbox-processes.ts')};
        const runtime = makeDaemonRuntime();
        const work = new AttachmentDaemonWork(runtime);
        const registry = createSandboxProcessRegistry({runtime, defaultWorkingDirectory: ${JSON.stringify(root)}, env: {}, resolveWorkingDirectory: value => value});
        const child = await registry.spawn({command: ${JSON.stringify(`exec node '${childFile}'`)}});
        const reservation = work.agentWork.reserve('test', 'run');
        work.track(new Promise(resolve => reservation.controller.signal.addEventListener('abort', async () => {
            await Bun.sleep(75);
            await writeFile(${JSON.stringify(saved)}, 'persisted');
            resolve();
        })));
        await withAttachmentShutdown(work, runtime, {dataRoot: ${JSON.stringify(root)}, serverId: 'srv_test'}, async () => {
            await writeFile(${JSON.stringify(ready)}, JSON.stringify({pid: child.pid}));
            setInterval(() => {}, 1000);
            return new Promise(() => {});
        });
    `
    );
    const daemon = Bun.spawn([process.execPath, source], { stdout: 'ignore', stderr: 'pipe' });
    let childPid: number | undefined;
    try {
        const deadline = Date.now() + 5000;
        while (!(await Bun.file(ready).exists())) {
            if (Date.now() >= deadline || daemon.exitCode !== null) {
                throw new Error(
                    `Daemon failed to start: ${await new Response(daemon.stderr).text()}`
                );
            }
            await Bun.sleep(10);
        }
        childPid = (await Bun.file(ready).json()).pid;
        await stopAttachmentProcess(daemon.pid);
        expect(await daemon.exited).toBe(0);
        expect(await readFile(saved, 'utf8')).toBe('persisted');
        expect(() => process.kill(childPid!, 0)).toThrow();
        expect(await new Response(daemon.stderr).text()).not.toContain('EPIPE');
    } finally {
        daemon.kill('SIGKILL');
        if (childPid) {
            try {
                process.kill(-childPid, 'SIGKILL');
            } catch {
                /* Already reaped. */
            }
        }
        await rm(root, { force: true, recursive: true });
    }
});

test('a shutdown timeout rejects instead of pretending state was saved', async () => {
    await expect(withShutdownDeadline(() => new Promise(() => {}), 5)).rejects.toThrow('timed out');
});

for (const failure of ['never settles', 'rejects'] as const) {
    test(`a workspace detach that ${failure} keeps run()'s result and exit`, async () => {
        const dataRoot = await mkdtemp(join(tmpdir(), 'haus-shutdown-detach-'));
        const agents = join(dataRoot, 'servers', 'srv_test', 'agents');
        const errors = spyOn(console, 'error').mockImplementation(() => undefined);
        const runtime = makeDaemonRuntime();
        const host = fakeHdiutil({ detach: () => 'ok' });
        try {
            if (failure === 'rejects') {
                // An unreadable agents directory rejects the whole detach pass.
                await mkdir(join(dataRoot, 'servers', 'srv_test'), { recursive: true });
                await writeFile(agents, 'not a directory');
            } else {
                await mkdir(join(agents, 'agt_hang567890abcdef', 'workspace'), { recursive: true });
                await writeFile(
                    join(agents, 'agt_hang567890abcdef', 'workspace-volume.json'),
                    JSON.stringify({ capacityBytes: 1024, volumeUuid: 'volume-uuid' })
                );
            }
            const disk = { ...host.disk, mountedUuid: () => new Promise<null>(() => undefined) };
            const startedAt = Date.now();

            const result = await withAttachmentShutdown(
                new AttachmentDaemonWork(runtime),
                runtime,
                { dataRoot, serverId: 'srv_test', volumes: { detachDeadlineMs: 50, disk } },
                async () => 7
            );

            expect(result).toBe(7);
            expect(Date.now() - startedAt).toBeLessThan(5000);
            expect(errors.mock.calls.flat().join('\n')).toContain('stay mounted until next start');
        } finally {
            errors.mockRestore();
            await runtime.dispose();
            await rm(dataRoot, { force: true, recursive: true });
        }
    });
}
