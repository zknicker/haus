import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import {
    type RuntimeProcessRegistry,
    sandboxProcessOwner,
} from '../harness/sandbox-process-owner.ts';
import { type HostToolServer, startHostToolServer } from '../host-tools/mcp-server.ts';
import { WarmProcessPool } from './warm-pool.ts';

/**
 * Computer-wide facilities every runtime driver shares, opened once by the attachment daemon:
 * the one host-tool MCP server, the shutdown registry every runtime process joins, and the warm
 * pool parked processes wait in between turns (specs/runtime-drivers.md).
 */
export interface RuntimeContext {
    readonly hostToolServer: Pick<HostToolServer, 'openSession'>;
    readonly processes: RuntimeProcessRegistry;
    readonly warm: WarmProcessPool;
}

interface OpenContext extends RuntimeContext {
    readonly server: HostToolServer;
}

const contexts = new WeakMap<DaemonRuntime, OpenContext>();

/** Starts the host-tool server and warm pool for `runtime`; closed by `closeRuntimeContext`. */
export function openRuntimeContext(
    runtime: DaemonRuntime,
    options: { warmIdleMs?: number } = {}
): RuntimeContext {
    if (contexts.has(runtime)) {
        throw new Error('The Computer runtime context is already open.');
    }
    const server = startHostToolServer();
    const context: OpenContext = {
        hostToolServer: server,
        processes: sandboxProcessOwner(runtime),
        server,
        warm: new WarmProcessPool({
            idleMs: options.warmIdleMs,
            onCloseError: (error) =>
                void runtime.runPromise(
                    Effect.logWarning('An idle runtime process did not stop cleanly.').pipe(
                        Effect.annotateLogs({
                            error: error instanceof Error ? error.message : String(error),
                            event: 'runtime-warm-close-failed',
                        })
                    )
                ),
        }),
    };
    contexts.set(runtime, context);
    return context;
}

/** The open context; turns only run inside an attachment daemon that opened it. */
export function requireRuntimeContext(runtime: DaemonRuntime): RuntimeContext {
    const context = contexts.get(runtime);
    if (!context) {
        throw new Error('The Computer runtime context is not open; no runtime driver can start.');
    }
    return context;
}

/** Ends the warm processes parked for one Agent session before its reset or removal. */
export async function evictWarmRuntime(runtime: DaemonRuntime, agentRoot: string): Promise<void> {
    await contexts.get(runtime)?.warm.evict(agentRoot);
}

/** Ends every warm runtime process, then stops the host-tool server (Computer shutdown). */
export async function closeRuntimeContext(runtime: DaemonRuntime): Promise<void> {
    const context = contexts.get(runtime);
    if (!context) {
        return;
    }
    contexts.delete(runtime);
    try {
        await context.warm.close();
    } finally {
        await context.server.stop();
    }
}
