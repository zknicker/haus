import { Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { type HostToolServer, startHostToolServer } from '../host-tools/mcp-server.ts';
import type { BackgroundWorkListener, BackgroundWorkReports } from './background-work.ts';
import type { IdleCompactionHooks } from './idle-compaction-scheduler.ts';
import { type RuntimeProcessRegistry, runtimeProcessOwner } from './process-registry.ts';
import { WarmProcessPool } from './warm-pool.ts';

/**
 * Computer-wide facilities every runtime driver shares, opened once by the attachment daemon:
 * the one host-tool MCP server, the shutdown registry every runtime process joins, and the warm
 * pool parked processes wait in between turns (specs/runtime-drivers.md).
 */
export interface RuntimeContext {
    /** Where drivers report background work that outlives a turn; absent in tests. */
    readonly background?: BackgroundWorkReports;
    readonly hostToolServer: Pick<HostToolServer, 'openSession'>;
    readonly processes: RuntimeProcessRegistry;
    readonly warm: WarmProcessPool;
}

interface OpenContext extends RuntimeContext {
    /** Agent roots whose process Haus is ending on purpose (reset, retirement, Stop). */
    readonly ending: Set<string>;
    readonly listener?: BackgroundWorkListener;
    readonly server: HostToolServer;
}

const contexts = new WeakMap<DaemonRuntime, OpenContext>();

/** Starts the host-tool server and warm pool for `runtime`; closed by `closeRuntimeContext`. */
export function openRuntimeContext(
    runtime: DaemonRuntime,
    options: {
        background?: BackgroundWorkListener;
        /** How long background work may hold a parked process (WarmPoolOptions). */
        backgroundLimitMs?: number;
        /** Records idle compactions; without it a parked session is never compacted. */
        idleCompaction?: IdleCompactionHooks;
        warmIdleMs?: number;
    } = {}
): RuntimeContext {
    if (contexts.has(runtime)) {
        throw new Error('The Computer runtime context is already open.');
    }
    const server = startHostToolServer();
    const ending = new Set<string>();
    const listener = options.background;
    const context: OpenContext = {
        ...(listener
            ? {
                  background: {
                      absorbed: (agentRoot) => listener.absorbed(agentRoot),
                      changed: (agentRoot, work) => listener.changed(agentRoot, work),
                      lost: (agentRoot) => listener.lost(agentRoot, ending.has(agentRoot)),
                      wake: (agentRoot) => listener.wake(agentRoot),
                  },
              }
            : {}),
        ending,
        hostToolServer: server,
        ...(listener ? { listener } : {}),
        processes: runtimeProcessOwner(runtime),
        server,
        warm: new WarmProcessPool({
            backgroundLimitMs: options.backgroundLimitMs,
            ...(options.idleCompaction
                ? { idleCompaction: { hooks: options.idleCompaction } }
                : {}),
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

/**
 * Ends the warm process parked for one Agent session, with any background work it runs, on
 * purpose: a reset, a retirement, a Restart, or a human Stop. Nobody is woken to report that
 * work, any wake still owed is retired, and the Agent's background files are settled before
 * this resolves, so a caller may then remove them.
 */
export async function evictWarmRuntime(runtime: DaemonRuntime, agentRoot: string): Promise<void> {
    const context = contexts.get(runtime);
    if (!context) {
        return;
    }
    context.ending.add(agentRoot);
    try {
        await context.warm.evict(agentRoot);
    } finally {
        context.ending.delete(agentRoot);
    }
    await context.listener?.retire(agentRoot);
}

/**
 * Interrupts the turn an Agent's parked runtime started on its own after the Server refused
 * its wake. A process a run already claimed is left alone: that run adopted the turn.
 */
export async function fenceWarmRuntime(runtime: DaemonRuntime, agentRoot: string): Promise<void> {
    await contexts.get(runtime)?.warm.fence(agentRoot);
}

/**
 * Applies the Server's idle compaction setting to every parked session: on arms them, off
 * cancels every armed compaction (one already running finishes).
 */
export function setIdleCompaction(runtime: DaemonRuntime, enabled: boolean): void {
    contexts.get(runtime)?.warm.setIdleCompaction(enabled);
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
