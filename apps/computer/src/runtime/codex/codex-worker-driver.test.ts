import { describe, expect, test } from 'bun:test';
import type { CodexProcessLaunch } from './codex-transport.ts';
import { codexWorkerEnv, createCodexWorkerDriver } from './codex-worker-driver.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';

const roots = ['/data/workers/wrk_1/drive', '/repos/acme/app/.git/worktrees/checkout'];

function workerDriver(fake: FakeAppServer, launches: CodexProcessLaunch[] = []) {
    return createCodexWorkerDriver({
        cwd: '/data/workers/wrk_1/checkout',
        env: { HAUS_WORKER_TOKEN: 'hwt_turn', PATH: '/data/workers/wrk_1/runtime/bin:/usr/bin' },
        homeDir: '/Users/person',
        modelId: 'gpt-5.6-luna',
        resolveExecutable: () => Promise.resolve({ env: {}, path: '/usr/bin/false' }),
        spawn: (launch) => {
            launches.push(launch);
            return fake;
        },
        writableRoots: roots,
    });
}

describe('Codex Worker driver', () => {
    test('a first turn starts a workspace-write thread with network and native AGENTS.md', async () => {
        const fake = new FakeAppServer();
        const launches: CodexProcessLaunch[] = [];
        const session = await workerDriver(fake, launches).openSession({
            resumeFrom: undefined,
            sessionId: 'wrk_1',
        });
        await session.startTurn({ prompt: 'brief', signal: new AbortController().signal });

        expect(fake.request('thread/start')?.params).toEqual({
            approvalPolicy: 'never',
            config: {
                sandbox_workspace_write: {
                    exclude_slash_tmp: true,
                    exclude_tmpdir_env_var: true,
                    network_access: true,
                    writable_roots: roots,
                },
            },
            cwd: '/data/workers/wrk_1/checkout',
            model: 'gpt-5.6-luna',
            sandbox: 'workspace-write',
        });
        expect(launches[0]?.cwd).toBe('/data/workers/wrk_1/checkout');
        expect(launches[0]?.args).toEqual(['app-server', '--listen', 'stdio://']);
        expect(session.sessionId).toBe('thread-1');
        expect(fake.request('turn/start')?.params.threadId).toBe('thread-1');
        await session.destroy();
    });

    test('a later turn resumes the native session it was given', async () => {
        const fake = new FakeAppServer({}, 'thread-9');
        const session = await workerDriver(fake).openSession({
            resumeFrom: { runtime: 'codex', threadId: 'thread-9', version: 1 },
            sessionId: 'wrk_1',
        });
        expect(fake.methods()).toEqual([
            'initialize',
            'initialized',
            'config/read',
            'thread/resume',
        ]);
        expect(fake.request('thread/resume')?.params.threadId).toBe('thread-9');
        expect(session.isResume).toBe(true);
        await session.stop();
    });

    test('the process runs as the machine user, with its CODEX_HOME and the Worker token', () => {
        const env = codexWorkerEnv(
            { env: { HAUS_WORKER_TOKEN: 'hwt_turn' }, homeDir: '/Users/person' },
            { CODEX_MANAGED_BY_NPM: '1' },
            { CODEX_HOME: '/Users/person/.codex-alt', CODEX_MANAGED_BY_BUN: '1', HOME: '/x' }
        );
        expect(env).toEqual({
            CODEX_HOME: '/Users/person/.codex-alt',
            CODEX_MANAGED_BY_NPM: '1',
            HAUS_WORKER_TOKEN: 'hwt_turn',
            HOME: '/Users/person',
            NO_BROWSER: '1',
        });
    });
});
