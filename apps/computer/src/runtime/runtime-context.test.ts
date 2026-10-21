import { expect, test } from 'bun:test';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { BackgroundWorkListener } from './background-work.ts';
import {
    closeRuntimeContext,
    evictWarmRuntime,
    fenceWarmRuntime,
    openRuntimeContext,
} from './runtime-context.ts';
import type { WarmProcess } from './warm-pool.ts';

const identity = { launchKey: 'k', nativeSessionId: 's', runtimeId: 'claude-code' };

function listening() {
    const events: string[] = [];
    const listener: BackgroundWorkListener = {
        absorbed: (agentRoot) => events.push(`absorbed ${agentRoot}`),
        changed: () => undefined,
        lost: (agentRoot, deliberate) => events.push(`lost ${agentRoot} ${deliberate}`),
        retire: (agentRoot) => {
            events.push(`retire ${agentRoot}`);
            return Promise.resolve();
        },
        settled: () => Promise.resolve(),
        wake: () => undefined,
    };
    return { events, listener };
}

test('evicting an Agent’s process is a deliberate end of its background work; a crash is not', async () => {
    const runtime = makeDaemonRuntime();
    const { events, listener } = listening();
    const context = openRuntimeContext(runtime, { background: listener });
    const ended = Promise.withResolvers<void>();
    // A process holding background work reports it lost as it exits, as a Claude connection does.
    const process: WarmProcess = {
        alive: true,
        close: () => {
            context.background?.lost('/agents/agt_a');
            ended.resolve();
            return Promise.resolve();
        },
        exited: ended.promise,
        holdsBackgroundWork: true,
    };
    await context.warm.park('/agents/agt_a', identity, process);
    await evictWarmRuntime(runtime, '/agents/agt_a');
    context.background?.lost('/agents/agt_b');
    // The deliberate end also retires any wake still owed and waits for its files.
    expect(events).toEqual([
        'lost /agents/agt_a true',
        'retire /agents/agt_a',
        'lost /agents/agt_b false',
    ]);
    await closeRuntimeContext(runtime);
    await runtime.dispose();
});

test('fencing interrupts the self-started turn of a parked process only', async () => {
    const runtime = makeDaemonRuntime();
    const context = openRuntimeContext(runtime, { background: listening().listener });
    let fenced = 0;
    const process: WarmProcess = {
        alive: true,
        close: () => Promise.resolve(),
        exited: new Promise(() => undefined),
        fenceSelfStartedTurn: () => {
            fenced += 1;
            return Promise.resolve();
        },
    };
    await context.warm.park('/agents/agt_a', identity, process);
    await fenceWarmRuntime(runtime, '/agents/agt_a');
    expect(fenced).toBe(1);
    // A run claimed it: that run adopted the turn, so there is nothing to fence.
    await context.warm.claim('/agents/agt_a', identity, (p): p is WarmProcess => true);
    await fenceWarmRuntime(runtime, '/agents/agt_a');
    expect(fenced).toBe(1);
    await closeRuntimeContext(runtime);
    await runtime.dispose();
});
