import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveDevPorts } from './dev-ports.mjs';
import {
    cleanupStaleProcesses,
    createDevStackEnvironment,
    formatPortBlockers,
} from './dev-stack-shared.mjs';
import { postgresServerPath } from './postgres-server-account.mjs';

test('formatPortBlockers includes current Server process details', () => {
    const repositoryRoot = path.join('/Users', 'zknicker', 'repo');
    const message = formatPortBlockers(
        [
            {
                command: 'bun --watch src/haus-server.ts',
                cwd: path.join(repositoryRoot, 'apps', 'server'),
                label: 'Haus Server',
                pid: 1234,
                port: 8090,
            },
        ],
        repositoryRoot
    );

    assert.match(message, /Haus Server port 8090 is already in use by PID 1234/u);
    assert.match(message, /\.\/apps\/server/u);
});

test('createDevStackEnvironment uses isolated current-product state', () => {
    const ports = resolveDevPorts({
        baseEnvironment: { HAUS_DEV_PORT_BASE: '42000', HAUS_DEV_STACK_ID: 'alpha' },
        repositoryRoot: '/repo/haus',
    });
    const environment = createDevStackEnvironment({
        baseEnvironment: {
            PATH: '/usr/bin',
            HAUS_DEV_PORT_BASE: '42000',
            HAUS_DEV_STACK_ID: 'alpha',
        },
        ports,
        repositoryRoot: '/repo/haus',
    });

    assert.equal(environment.PATH, '/usr/bin');
    assert.equal(
        environment.HAUS_COMPUTER_DATA_ROOT,
        path.join(os.homedir(), '.haus', 'dev', 'alpha', 'computer')
    );
    assert.equal(
        environment.HAUS_POSTGRES_DATA_ROOT,
        postgresServerPath(path.join(os.homedir(), '.haus', 'dev', 'alpha', 'postgres'))
    );
    assert.equal(environment.HAUS_SERVER_PORT, '42003');
    assert.equal(environment.HAUS_WEBSITE_PORT, '42000');
    assert.equal(environment.HAUS_DEV_STACK, '1');
});

test('resolveDevPorts derives different groups for different worktrees', () => {
    const left = resolveDevPorts({ repositoryRoot: '/repo/worktree-left/haus' });
    const right = resolveDevPorts({ repositoryRoot: '/repo/worktree-right/haus' });

    assert.notDeepEqual(left, right);
    assert.equal(Number(left.hausPort), Number(left.websitePort) + 3);
});

test('resolveDevPorts shares ports for an explicit stack id', () => {
    const baseEnvironment = { HAUS_DEV_STACK_ID: 'haus-shared' };
    const left = resolveDevPorts({ baseEnvironment, repositoryRoot: '/repo/left' });
    const right = resolveDevPorts({ baseEnvironment, repositoryRoot: '/repo/right' });

    assert.deepEqual(left, right);
});

test('cleanupStaleProcesses closes an orphaned Haus Server watcher', () => {
    const repositoryRoot = '/repo';
    const killedProcesses = [];
    const cleanupCount = cleanupStaleProcesses({
        ports: { hausPort: 8083, websitePort: 8080 },
        processTools: {
            killProcess: (pid, signal) => killedProcesses.push([pid, signal]),
            listListeningProcessIds: (port) => (port === 8083 ? [333] : []),
            readProcessCommand: () => 'bun --watch src/haus-server.ts',
            readProcessWorkingDirectory: () => path.join(repositoryRoot, 'apps', 'server'),
            waitForProcessExit: () => undefined,
        },
        repositoryRoot,
    });

    assert.equal(cleanupCount, 1);
    assert.deepEqual(killedProcesses, [[333, 'SIGTERM']]);
});
