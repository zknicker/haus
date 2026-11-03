import { expect, test } from 'bun:test';
import { Runtime } from 'effect';
import { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import { closeDaemonCoordination, makeDaemonRuntime } from './daemon-runtime.ts';

test('a start waits for every queued Agent configuration', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new AgentWorkCoordinator(runtime);
    const firstGate = Promise.withResolvers<void>();
    const events: string[] = [];

    const first = coordinator.enqueueConfiguration('agt_test', async () => {
        await firstGate.promise;
        events.push('first configuration');
    });
    const second = coordinator.enqueueConfiguration('agt_test', async () => {
        events.push('second configuration');
    });
    const start = coordinator.waitForConfiguration('agt_test').then(() => events.push('start'));

    expect(events).toEqual([]);
    firstGate.resolve();
    await Promise.all([first, second, start]);
    expect(events).toEqual(['first configuration', 'second configuration', 'start']);
    await runtime.dispose();
});

test('a failed configuration does not poison later work', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new AgentWorkCoordinator(runtime);
    const first = coordinator.enqueueConfiguration('agt_test', async () => {
        throw new Error('configuration failed');
    });
    const second = coordinator.enqueueConfiguration('agt_test', async () => undefined);

    await expect(first).rejects.toThrow('configuration failed');
    await expect(second).resolves.toBeUndefined();
    await runtime.dispose();
});

test('run release resolves every settlement waiter without polling', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new AgentWorkCoordinator(runtime);
    expect(coordinator.reserve('agt_test', 'run_test').kind).toBe('reserved');

    let settled = 0;
    const first = coordinator.waitForRun('agt_test').then(() => {
        settled += 1;
    });
    const second = coordinator.waitForRun('agt_test').then(() => {
        settled += 1;
    });
    await Promise.resolve();
    expect(settled).toBe(0);

    coordinator.release('agt_test', 'run_test');
    await Promise.all([first, second]);
    expect(settled).toBe(2);
    await runtime.dispose();
});

test('runtime shutdown interrupts active and queued configuration work', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new AgentWorkCoordinator(runtime);
    const started = Promise.withResolvers<void>();
    let foreignAbortObserved = false;
    const active = coordinator.enqueueConfiguration('agt_test', (signal) => {
        started.resolve();
        return new Promise<void>(() => {
            signal.addEventListener('abort', () => {
                foreignAbortObserved = true;
            });
        });
    });
    await started.promise;
    const queued = coordinator.enqueueConfiguration('agt_test', async () => undefined);

    await closeDaemonCoordination(runtime);

    expect(Runtime.isFiberFailure(await active.catch((cause) => cause))).toBe(true);
    expect(Runtime.isFiberFailure(await queued.catch((cause) => cause))).toBe(true);
    expect(foreignAbortObserved).toBe(true);
    await runtime.dispose();
});

test('a start behind a stopping run waits for it to settle instead of being dropped', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new AgentWorkCoordinator(runtime);
    coordinator.reserve('agt_x', 'run_old');
    expect(coordinator.reserve('agt_x', 'run_new')).toEqual({ kind: 'busy' });

    coordinator.abortRun('run_old');
    const stopping = coordinator.reserve('agt_x', 'run_new');
    expect(stopping.kind === 'busy' && stopping.stopping).toBeInstanceOf(Promise);

    coordinator.release('agt_x', 'run_old');
    if (stopping.kind === 'busy') {
        await stopping.stopping;
    }
    expect(coordinator.reserve('agt_x', 'run_new').kind).toBe('reserved');
    coordinator.release('agt_x', 'run_new');
    await runtime.dispose();
});

test('run reservation is synchronous, per-Agent, and abortable at the foreign edge', async () => {
    const runtime = makeDaemonRuntime();
    const coordinator = new AgentWorkCoordinator(runtime);
    const reserved = coordinator.reserve('agt_x', 'run_x');
    expect(reserved.kind).toBe('reserved');
    expect(coordinator.reserve('agt_x', 'run_x')).toEqual({ kind: 'duplicate' });
    expect(coordinator.reserve('agt_x', 'run_y')).toEqual({ kind: 'busy' });
    expect(coordinator.reserve('agt_y', 'run_z').kind).toBe('reserved');

    if (reserved.kind === 'reserved') {
        coordinator.abortRun('run_x');
        expect(reserved.controller.signal.aborted).toBe(true);
    }
    coordinator.release('agt_x', 'run_x');
    expect(coordinator.reserve('agt_x', 'run_y').kind).toBe('reserved');
    coordinator.release('agt_x', 'run_y');
    coordinator.release('agt_y', 'run_z');
    await runtime.dispose();
});
