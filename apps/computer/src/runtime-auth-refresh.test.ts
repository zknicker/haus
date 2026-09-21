import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshRuntimeAuthentication } from './runtime-auth-refresh.ts';
import { readRuntimeIssues, recordRuntimeOutcome } from './runtime-issues.ts';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(output: string, exitCode = 0) {
    const root = await mkdtemp(join(tmpdir(), 'haus-auth-refresh-'));
    roots.push(root);
    const executable = join(root, 'claude');
    await writeFile(
        executable,
        `#!/bin/sh\nif [ "$1" = "--version" ]; then echo test; exit 0; fi\n[ "$1 $2" = "auth status" ] || exit 2\nprintf '%s' '${output}'\nexit ${exitCode}\n`
    );
    await chmod(executable, 0o755);
    await recordRuntimeOutcome({
        dataRoot: root,
        runtimeId: 'claude-code',
        startedAt: '2026-09-21T16:17:39.395Z',
        status: 'failed',
        failureKind: 'authentication',
    });
    return root;
}

test('a fresh Claude login clears the persisted failure without an Agent turn', async () => {
    const dataRoot = await fixture('{"loggedIn":true}');
    await recordRuntimeOutcome({
        dataRoot,
        runtimeId: 'codex',
        startedAt: '2026-09-21T16:17:39.395Z',
        status: 'failed',
        failureKind: 'authentication',
    });
    await refreshRuntimeAuthentication({ dataRoot, searchPath: dataRoot });
    expect(await readRuntimeIssues(dataRoot)).toEqual([
        { runtimeId: 'codex', kind: 'authentication', observedAt: '2026-09-21T16:17:39.395Z' },
    ]);
});

for (const [output, exitCode] of [
    ['{"loggedIn":false}', 0],
    ['{"loggedIn":true}', 1],
    ['not json', 0],
    ['{}', 0],
] as const) {
    test(`an unconfirmed login preserves the warning: ${output}, exit ${exitCode}`, async () => {
        const dataRoot = await fixture(output, exitCode);
        await refreshRuntimeAuthentication({ dataRoot, searchPath: dataRoot });
        expect(await readRuntimeIssues(dataRoot)).toHaveLength(1);
    });
}

test('an older login check cannot clear a newer execution failure', async () => {
    const dataRoot = await fixture('{"loggedIn":true}');
    await refreshRuntimeAuthentication({
        dataRoot,
        searchPath: dataRoot,
        now: new Date('2026-09-21T16:00:00.000Z'),
    });
    expect(await readRuntimeIssues(dataRoot)).toHaveLength(1);
});

test('manual inventory refresh publishes cleared health before acknowledging completion', async () => {
    const { handleInventoryRefresh } = await import('./inventory-refresh.ts');
    const dataRoot = await fixture('{"loggedIn":true}');
    const frames: unknown[] = [];
    const work: Promise<unknown>[] = [];
    expect(
        handleInventoryRefresh(
            { requestId: 'req_auth_refresh', type: 'inventory-refresh-request' },
            {
                send: (frame) => {
                    frames.push(frame);
                    return true;
                },
                track: (promise) => {
                    work.push(promise);
                    return promise;
                },
                refreshUsage: async () => {},
                refreshReport: async () => {
                    await refreshRuntimeAuthentication({ dataRoot, searchPath: dataRoot });
                    frames.push({
                        type: 'report',
                        runtimeIssues: await readRuntimeIssues(dataRoot),
                    });
                },
            }
        )
    ).toBe(true);
    await Promise.all(work);
    expect(frames[0]).toEqual({ type: 'report', runtimeIssues: [] });
    expect(frames[1]).toMatchObject({ type: 'inventory-refresh-result', status: 'refreshed' });
});

test('a missing CLI preserves the historical failure', async () => {
    const dataRoot = await fixture('{"loggedIn":true}');
    await rm(join(dataRoot, 'claude'));
    await refreshRuntimeAuthentication({ dataRoot, searchPath: dataRoot });
    expect(await readRuntimeIssues(dataRoot)).toHaveLength(1);
});

test('a login confirmation survives restart and rejects a delayed older failure', async () => {
    const dataRoot = await fixture('{"loggedIn":true}');
    await refreshRuntimeAuthentication({ dataRoot, searchPath: dataRoot });
    await recordRuntimeOutcome({
        dataRoot,
        runtimeId: 'claude-code',
        startedAt: '2026-09-21T16:17:39.395Z',
        status: 'failed',
        failureKind: 'authentication',
    });
    expect(await readRuntimeIssues(dataRoot)).toEqual([]);
});

test('ordinary reports preserve failures, while an explicit recheck publishes their recovery', async () => {
    const { computerReportSchema } = await import('@haus/api');
    const { createComputerReporter } = await import('./computer-report.ts');
    const dataRoot = await fixture('{"loggedIn":true}');
    const previousPath = process.env.PATH;
    process.env.PATH = `${dataRoot}:${previousPath ?? ''}`;
    const frames: unknown[] = [];
    const send = (frame: unknown) => {
        frames.push(frame);
        return true;
    };
    const report = createComputerReporter(dataRoot);
    try {
        await report(send, 'srv_test', 'Test Computer');
        expect(computerReportSchema.strip().parse(frames[0]).inventory.runtimeIssues).toHaveLength(
            1
        );
        frames.length = 0;
        await report(send, 'srv_test', 'Test Computer', true);
        expect(computerReportSchema.strip().parse(frames[0]).inventory.runtimeIssues).toEqual([]);
    } finally {
        if (previousPath === undefined) {
            Reflect.deleteProperty(process.env, 'PATH');
        } else {
            process.env.PATH = previousPath;
        }
    }
});
