import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restartOwnedSession } from './agent-partition-lifecycle.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { isSessionRestartRequested } from './harness/session-restart.ts';
import { closeRuntimeContext, openRuntimeContext } from './runtime/runtime-context.ts';
import type { WarmProcess } from './runtime/warm-pool.ts';

let dataRoot: string | undefined;

afterEach(async () => {
    if (dataRoot) {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('Restart ends the parked process and its background work on purpose, like Stop', async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-restart-'));
    const agentRoot = join(dataRoot, 'servers', 'srv_one', 'agents', 'agt_one');
    const runtime = makeDaemonRuntime();
    const lost: boolean[] = [];
    const retired: string[] = [];
    const context = openRuntimeContext(runtime, {
        background: {
            absorbed: () => undefined,
            changed: () => undefined,
            lost: (_root, deliberate) => lost.push(deliberate),
            retire: (root) => {
                retired.push(root);
                return Promise.resolve();
            },
            settled: () => Promise.resolve(),
            wake: () => undefined,
        },
    });
    const ended = Promise.withResolvers<void>();
    let closes = 0;
    const process: WarmProcess = {
        alive: true,
        close: () => {
            closes += 1;
            context.background?.lost(agentRoot);
            ended.resolve();
            return Promise.resolve();
        },
        exited: ended.promise,
        holdsBackgroundWork: true,
    };
    await context.warm.park(
        agentRoot,
        { launchKey: 'k', nativeSessionId: 's', runtimeId: 'claude-code' },
        process
    );

    await restartOwnedSession({ agentId: 'agt_one', dataRoot, runtime, serverId: 'srv_one' });

    expect(closes).toBe(1);
    expect(lost).toEqual([true]);
    expect(retired).toEqual([agentRoot]);
    expect(await isSessionRestartRequested(agentRoot)).toBe(true);
    await closeRuntimeContext(runtime);
    await runtime.dispose();
});
