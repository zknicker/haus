import { expect, test } from 'bun:test';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { closeRuntimeContext, evictWarmRuntime, openRuntimeContext } from './runtime-context.ts';
import type { WarmProcess } from './warm-pool.ts';

test('evicting an Agent’s process is a deliberate end of its background work; a crash is not', async () => {
    const runtime = makeDaemonRuntime();
    const lost: [string, boolean][] = [];
    const context = openRuntimeContext(runtime, {
        background: {
            changed: () => undefined,
            lost: (agentRoot, deliberate) => lost.push([agentRoot, deliberate]),
            wake: () => undefined,
        },
    });
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
    await context.warm.park(
        '/agents/agt_a',
        { launchKey: 'k', nativeSessionId: 's', runtimeId: 'claude-code' },
        process
    );
    await evictWarmRuntime(runtime, '/agents/agt_a');
    context.background?.lost('/agents/agt_b');
    expect(lost).toEqual([
        ['/agents/agt_a', true],
        ['/agents/agt_b', false],
    ]);
    await closeRuntimeContext(runtime);
    await runtime.dispose();
});
