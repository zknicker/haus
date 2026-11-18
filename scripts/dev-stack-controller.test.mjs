import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createDesktopDevEnvironment, DevStackController } from './dev-stack-controller.mjs';
import { signalChildProcessGroup, waitForChildShutdown } from './dev-stack-processes.mjs';

test('App development inherits the schema-resolved Haus Server auth audience', () => {
    assert.deepEqual(
        createDesktopDevEnvironment({
            devStackEnvironment: {
                HAUS_CF_ACCESS_AUDIENCE: 'haus-development-audience',
                PATH: '/usr/bin',
            },
            ports: {
                hausPort: 25_251,
                websitePort: 25_248,
            },
        }),
        {
            HAUS_CF_ACCESS_AUDIENCE: 'haus-development-audience',
            PATH: '/usr/bin',
            HAUS_WEBSITE_PORT: '25248',
        }
    );
});

test('dev stack shutdown signals all managed processes before waiting in order', async () => {
    const controller = new DevStackController({
        mode: 'desktop',
        ports: { hausPort: 31_003, websitePort: 31_000 },
        repositoryRoot: process.cwd(),
    });
    const desktop = createManagedChildProcessStub(2_147_483_641, { autoExit: false });
    const website = createManagedChildProcessStub(2_147_483_642);
    const computer = createManagedChildProcessStub(2_147_483_643);

    controller.processes.set('desktop', desktop);
    controller.processes.set('website', website);
    controller.processes.set('computer', computer);

    const stopPromise = controller.stop(0);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(desktop.signals, ['SIGTERM']);
    assert.deepEqual(website.signals, ['SIGTERM']);
    assert.deepEqual(computer.signals, ['SIGTERM']);

    desktop.exitCode = 0;
    desktop.emit('exit', 0, null);
    await stopPromise;
});

test('dev stack shutdown forwards the operator signal to managed processes', async () => {
    const controller = new DevStackController({
        mode: 'web',
        ports: { hausPort: 31_003, websitePort: 31_000 },
        repositoryRoot: process.cwd(),
    });
    const website = createManagedChildProcessStub(2_147_483_642);
    const computer = createManagedChildProcessStub(2_147_483_643);

    controller.processes.set('website', website);
    controller.processes.set('computer', computer);

    await controller.stop(130, { signal: 'SIGINT' });

    assert.deepEqual(website.signals, ['SIGINT']);
    assert.deepEqual(computer.signals, ['SIGINT']);
});

test('dev stack shutdown signals postgres only after the Server and Computer exit', async () => {
    const { controller, computer, haus, log, postgres } = createPostgresStackStub();

    const stopPromise = controller.stop(130, { signal: 'SIGINT' });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(log, ['computer:SIGINT', 'haus:SIGINT']);
    exitChild(computer, log, 'computer');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(postgres.signals, []);

    exitChild(haus, log, 'haus');
    await stopPromise;

    assert.deepEqual(log, [
        'computer:SIGINT',
        'haus:SIGINT',
        'computer:exit',
        'haus:exit',
        'postgres:SIGINT',
    ]);
});

test('forced dev stack shutdown signals postgres without waiting for the Server', async () => {
    const { controller, computer, haus, log, postgres } = createPostgresStackStub();

    const stopPromise = controller.stop(130, { signal: 'SIGINT' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(postgres.signals, []);

    controller.stop(130, { force: true, signal: 'SIGINT' });
    assert.deepEqual(log.slice(2).sort(), ['computer:SIGTERM', 'haus:SIGTERM', 'postgres:SIGINT']);

    exitChild(computer, log, 'computer');
    exitChild(haus, log, 'haus');
    await stopPromise;
});

test('waitForChildShutdown waits after the shell exits until the process group is gone', async () => {
    const child = createChildProcessStub();
    let groupActive = true;
    const startedAt = Date.now();

    const stopped = await waitForChildShutdown(
        child,
        () => {
            child.exitCode = 0;
            child.emit('exit', 0, null);
            setTimeout(() => {
                groupActive = false;
            }, 20);
        },
        {
            isProcessGroupActive: () => groupActive,
            pollMs: 1,
            timeoutMs: 250,
        }
    );

    assert.equal(stopped, true);
    assert.ok(Date.now() - startedAt >= 15);
});

test('waitForChildShutdown times out when the process group survives the shell', async () => {
    const child = createChildProcessStub();

    const stopped = await waitForChildShutdown(
        child,
        () => {
            child.exitCode = 0;
            child.emit('exit', 0, null);
        },
        {
            isProcessGroupActive: () => true,
            pollMs: 1,
            timeoutMs: 10,
        }
    );

    assert.equal(stopped, false);
});

test('signalChildProcessGroup can signal surviving groups after the shell exits', () => {
    const child = createChildProcessStub();
    const signals = [];

    child.exitCode = 0;

    const signaled = signalChildProcessGroup(child, 'SIGKILL', (pid, signal) => {
        signals.push({ pid, signal });
    });

    assert.equal(signaled, true);
    assert.deepEqual(signals, [{ pid: -2_147_483_645, signal: 'SIGKILL' }]);
});

test('managed processes launch directly without an intermediate shell', () => {
    const spawnCalls = [];
    const child = createManagedChildProcessStub(2_147_483_646, { autoExit: false });
    const controller = new DevStackController({
        mode: 'web',
        ports: { hausPort: 31_003, websitePort: 31_000 },
        repositoryRoot: process.cwd(),
        spawnImpl: (...args) => {
            spawnCalls.push(args);
            return child;
        },
    });

    controller.spawnProcess('computer', 'bun', ['--watch', 'src/index.ts', 'start'], {
        cwd: '/tmp/haus-computer',
        env: { HAUS_SERVER_PORT: '31003' },
    });

    assert.deepEqual(spawnCalls, [
        [
            'bun',
            ['--watch', 'src/index.ts', 'start'],
            {
                cwd: '/tmp/haus-computer',
                detached: true,
                env: { HAUS_SERVER_PORT: '31003' },
                shell: false,
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        ],
    ]);
});

function createChildProcessStub() {
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = () => {
        throw new Error('child.kill should not be called');
    };
    child.off = child.removeListener.bind(child);
    child.pid = 2_147_483_645;
    child.signalCode = null;
    return child;
}

function createPostgresStackStub() {
    const log = [];
    const controller = new DevStackController({
        mode: 'web',
        ports: { hausPort: 31_003, websitePort: 31_000 },
        repositoryRoot: process.cwd(),
    });
    const stub = (pid, name, autoExit) =>
        createManagedChildProcessStub(pid, { autoExit, log, name });
    const computer = stub(2_147_483_643, 'computer', false);
    const haus = stub(2_147_483_644, 'haus', false);
    const postgres = stub(2_147_483_640, 'postgres', true);

    controller.processes.set('postgres', postgres);
    controller.processes.set('computer', computer);
    controller.processes.set('haus', haus);
    return { controller, computer, haus, log, postgres };
}

function exitChild(child, log, name) {
    log.push(`${name}:exit`);
    child.exitCode = 0;
    child.emit('exit', 0, null);
}

function createManagedChildProcessStub(pid, options = {}) {
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = (signal) => {
        child.signals.push(signal);
        options.log?.push(`${options.name}:${signal}`);
        if (options.autoExit !== false) {
            child.signalCode = signal;
            child.emit('exit', null, signal);
        }
        return true;
    };
    child.off = child.removeListener.bind(child);
    child.pid = pid;
    child.signalCode = null;
    child.signals = [];
    return child;
}
