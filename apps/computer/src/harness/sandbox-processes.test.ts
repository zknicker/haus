import { afterAll, afterEach, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { parseProcStat } from './process-group-liveness.ts';
import { createSandboxProcessRegistry } from './sandbox-processes.ts';

const roots: string[] = [];
const registries: ReturnType<typeof createSandboxProcessRegistry>[] = [];
const runtime = makeDaemonRuntime();
const TERM_RESISTANT_PROCESS_TREE =
    "trap '' TERM; sh -c 'trap \"\" TERM; exec sleep 30' & echo $! > descendant.pid; wait";

afterAll(() => runtime.dispose());

afterEach(async () => {
    const cleanup = await Promise.allSettled(
        registries.splice(0).map((registry) => registry.destroy())
    );
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
    const failures = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
    );
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Sandbox test processes did not terminate.');
    }
});

test('an abort before wait is observed does not create an unhandled rejection', async () => {
    const registry = await makeRegistry();
    const controller = new AbortController();
    controller.abort();
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
        const child = await registry.spawn({
            abortSignal: controller.signal,
            command: 'sleep 30',
        });
        await Bun.sleep(25);

        expect(unhandledRejections).toEqual([]);
        await expect(child.wait()).rejects.toMatchObject({
            code: 'ABORT_ERR',
            name: 'AbortError',
        });
        await registry.destroy();
    } finally {
        process.off('unhandledRejection', onUnhandledRejection);
        await registry.destroy();
    }
});

test('destroy retains and terminates a background group after its shell exits', async () => {
    if (process.platform === 'win32') {
        return;
    }
    const registry = await makeRegistry();
    const child = await registry.spawn({
        command: 'sh -c \'trap "" TERM; exec sleep 30\' >/dev/null 2>&1 & echo $! > descendant.pid',
    });
    const descendantPid = await readPidWhenReady(join(registry.root, 'descendant.pid'));

    await expect(child.wait()).resolves.toEqual({ exitCode: 0 });
    expect(isProcessAlive(descendantPid)).toBe(true);

    await registry.destroy();

    expect(isProcessAlive(descendantPid)).toBe(false);
});

test('concurrent kill and destroy terminate the complete owned process group', async () => {
    if (process.platform === 'win32') {
        return;
    }
    const registry = await makeRegistry();
    const child = await registry.spawn({
        command: TERM_RESISTANT_PROCESS_TREE,
    });
    const descendantPid = await readPidWhenReady(join(registry.root, 'descendant.pid'));

    expect(isProcessAlive(child.pid)).toBe(true);
    expect(isProcessAlive(descendantPid)).toBe(true);

    await Promise.all([child.kill(), registry.destroy()]);

    expect(isProcessAlive(child.pid)).toBe(false);
    expect(isProcessAlive(descendantPid)).toBe(false);
    await child.kill();
    await registry.destroy();
});

test('abort terminates descendants while preserving AbortError for wait', async () => {
    if (process.platform === 'win32') {
        return;
    }
    const registry = await makeRegistry();
    const controller = new AbortController();
    const child = await registry.spawn({
        abortSignal: controller.signal,
        command: TERM_RESISTANT_PROCESS_TREE,
    });
    const descendantPid = await readPidWhenReady(join(registry.root, 'descendant.pid'));

    controller.abort();

    await expect(child.wait()).rejects.toMatchObject({
        code: 'ABORT_ERR',
        name: 'AbortError',
    });
    expect(isProcessAlive(descendantPid)).toBe(false);
    await registry.destroy();
});

async function makeRegistry() {
    const root = await mkdtemp(join(tmpdir(), 'haus-sandbox-processes-'));
    roots.push(root);
    const registry = createSandboxProcessRegistry({
        defaultWorkingDirectory: root,
        env: {},
        resolveWorkingDirectory: (value) => value,
        runtime,
    });
    registries.push(registry);
    return Object.assign(registry, { root });
}

async function readPidWhenReady(path: string): Promise<number> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const pid = Number.parseInt(await readFile(path, 'utf8'), 10);
            if (Number.isSafeInteger(pid)) {
                return pid;
            }
        } catch {}
        await Bun.sleep(10);
    }
    throw new Error(`Process did not write its pid to ${path}.`);
}

function isProcessAlive(pid: number | undefined): boolean {
    if (pid === undefined) {
        return false;
    }
    try {
        process.kill(pid, 0);
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
            return false;
        }
        throw error;
    }
    // A zombie no init process reaps (a container's PID 1) has already exited.
    return (
        !existsSync(`/proc/${pid}/stat`) ||
        parseProcStat(readFileSync(`/proc/${pid}/stat`, 'utf8'))?.state !== 'Z'
    );
}

test('parses a process state and group past a comm containing parens', () => {
    expect(parseProcStat('42 (a) b)) S 1 42 42 0')).toEqual({ processGroupId: 42, state: 'S' });
    expect(parseProcStat('43 (sleep) Z 1 40 40 0')).toEqual({ processGroupId: 40, state: 'Z' });
});
