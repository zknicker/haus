import { Duration, Effect, type Exit, Option, Ref, Scope } from 'effect';
import type { FastifyInstance } from 'fastify';
import type { startComputerAttachmentSocket } from './computers/socket.ts';
import type { startHausWebSocketServer } from './haus-api/ws.ts';
import type { HausConnection } from './postgres/connection.ts';
import type { ServerRecurringWork } from './recurring-work.ts';
import type { McpRuntime } from './server-mcp/runtime.ts';
import type { ServerPostCommitWork } from './server-post-commit-work.ts';
import type { startVoiceSocket } from './voice/voice-socket.ts';

export interface HausServerShutdownResources {
    broadcastReconnectNotification(): void;
    closeComputerSocket(): Promise<void> | void;
    closeDatabase(): Promise<void>;
    closeFastify(): Promise<void>;
    closeHostedMcps(): Promise<void>;
    closeHttpConnections(): void;
    closeMcpClients(): Promise<void>;
    closePostCommitWork(): Promise<void>;
    closeRecurringWork(): Promise<void>;
    closeWebSocketServer(): Promise<void> | void;
}

/**
 * What the application has started so far. Startup fills these in order; a
 * failure part way tears down only what exists.
 */
export interface HausServerHandles {
    app: FastifyInstance | null;
    computerSocket: ReturnType<typeof startComputerAttachmentSocket> | null;
    haus: HausConnection | null;
    mcpRuntime: McpRuntime | null;
    postCommitWork: ServerPostCommitWork | null;
    recurringWork: ServerRecurringWork | null;
    voiceSocket: ReturnType<typeof startVoiceSocket> | null;
    webSocketServer: ReturnType<typeof startHausWebSocketServer> | null;
}

export function emptyHausServerHandles(): HausServerHandles {
    return {
        app: null,
        computerSocket: null,
        haus: null,
        mcpRuntime: null,
        postCommitWork: null,
        recurringWork: null,
        voiceSocket: null,
        webSocketServer: null,
    };
}

/**
 * Teardown over whatever `handles` holds when it runs. `closeHostedMcps`
 * ends hosted MCP processes in their own bounded step.
 */
export function hausServerShutdownResources(
    handles: HausServerHandles,
    closeHostedMcps: () => Promise<void>
): HausServerShutdownResources {
    return {
        broadcastReconnectNotification: () =>
            handles.webSocketServer?.broadcastReconnectNotification(),
        closeComputerSocket: () => handles.computerSocket?.close(),
        closeDatabase: async () => {
            await handles.haus?.close();
        },
        closeFastify: async () => {
            await handles.app?.close();
        },
        closeHostedMcps,
        closeHttpConnections: () => handles.app?.server.closeAllConnections(),
        closeMcpClients: async () => {
            await handles.mcpRuntime?.close();
        },
        closePostCommitWork: async () => {
            await handles.postCommitWork?.close();
        },
        closeRecurringWork: async () => {
            await handles.recurringWork?.close();
        },
        closeWebSocketServer: async () => {
            await handles.voiceSocket?.close();
            handles.webSocketServer?.close();
        },
    };
}

export interface HausServerShutdownOptions {
    /** Receives slow, failed, or skipped steps as they happen, then one timed summary. */
    log?(line: string): void;
    /** How long one step may run before it is logged as pending and skipped. */
    stepTimeoutMs?: number;
}

export interface HausServerShutdown {
    close(
        scope: Scope.CloseableScope,
        exit: Exit.Exit<unknown, unknown>
    ): Effect.Effect<void, unknown>;
    register(resources: HausServerShutdownResources): Effect.Effect<void, never, Scope.Scope>;
    /** Adds one named, traced, bounded finalizer to the scope it runs in. */
    step(
        name: string,
        run: () => Promise<void> | void,
        options?: ShutdownStepOptions
    ): Effect.Effect<void, never, Scope.Scope>;
}

export interface ShutdownStepOptions {
    /** Overrides the step bound, only for a step whose own inner bound reaches it. */
    timeoutMs?: number;
}

export const shutdownStepTimeoutMs = 5000;
/**
 * The MCP client close carries its own 5s bound (`McpRuntime` closeTimeoutMs)
 * after the inventory stops, so a hung upstream finishes just past 5s. The
 * extra second lets that inner bound report instead of racing the step bound.
 */
const mcpClientsStepTimeoutMs = 6000;
/** A step at least this slow is logged as it finishes, not only in the summary. */
const slowStepMs = 250;

/** `quiet` lands only in the summary; the others are logged as they happen. */
type StepNotice = 'info' | 'quiet' | 'warning';

/**
 * Owns Server teardown in one sequential Scope. Finalizers are registered in
 * reverse so Scope's LIFO release order stays the public shutdown contract.
 * Every step is timed and bounded: a step that outlives its bound is logged
 * as still pending and skipped, so one stuck resource cannot hold the process.
 */
export function makeHausServerShutdown(
    options: HausServerShutdownOptions = {}
): Effect.Effect<HausServerShutdown> {
    const log = (line: string, level: 'info' | 'warning' = 'info') => {
        if (options.log) {
            return Effect.sync(() => options.log?.(line));
        }
        return level === 'warning' ? Effect.logWarning(line) : Effect.logInfo(line);
    };
    const defaultTimeoutMs = options.stepTimeoutMs ?? shutdownStepTimeoutMs;
    const finished: string[] = [];
    return Ref.make<Option.Option<unknown>>(Option.none()).pipe(
        Effect.map((firstFailure) => {
            const step: HausServerShutdown['step'] = (name, run, stepOptions) =>
                Effect.addFinalizer(() =>
                    runStep(
                        name,
                        run,
                        Duration.millis(stepOptions?.timeoutMs ?? defaultTimeoutMs),
                        (line, notice) =>
                            Effect.suspend(() => {
                                finished.push(line);
                                return notice === 'quiet'
                                    ? Effect.void
                                    : log(`[haus] shutdown ${line}`, notice);
                            })
                    ).pipe(
                        Effect.catchAll((failure) =>
                            Ref.update(firstFailure, (current) =>
                                Option.isSome(current) ? current : Option.some(failure)
                            )
                        )
                    )
                );
            return {
                close: (scope, exit) =>
                    Effect.gen(function* () {
                        yield* Scope.close(scope, exit);
                        yield* log(`[haus] shutdown steps: ${finished.join(', ')}`);
                        const failure = yield* Ref.get(firstFailure);
                        if (Option.isSome(failure)) {
                            return yield* Effect.fail(failure.value);
                        }
                    }),
                register: (resources) =>
                    Effect.gen(function* () {
                        for (const [name, run, stepOptions] of shutdownSteps(resources)) {
                            yield* step(name, run, stepOptions);
                        }
                    }),
                step,
            };
        })
    );
}

/**
 * Times one step. Every result lands in the closing summary; a slow step is
 * also logged at info, and a failed or skipped step at warning, as it happens
 * so a later hard kill still names it.
 */
function runStep(
    name: string,
    run: () => Promise<void> | void,
    timeout: Duration.Duration,
    record: (line: string, notice: StepNotice) => Effect.Effect<void>
) {
    // The error channel stays the foreign failure so close can rethrow it unchanged.
    return Effect.suspend(() => {
        const startedAt = performance.now();
        const elapsedMs = () => Math.round(performance.now() - startedAt);
        // Finalizers run uninterruptibly; the step must be interruptible or the
        // timeout would wait for it forever.
        return Effect.interruptible(
            Effect.tryPromise({
                catch: (cause) => cause,
                try: () => Promise.resolve().then(run),
            })
        ).pipe(
            Effect.timeoutFail({
                duration: timeout,
                onTimeout: () => new Error(`Server shutdown step ${name} still pending; skipped`),
            }),
            Effect.tap(() =>
                Effect.suspend(() => {
                    const ms = elapsedMs();
                    return record(`${name} ${ms}ms`, ms >= slowStepMs ? 'info' : 'quiet');
                })
            ),
            Effect.tapError((failure) =>
                Effect.suspend(() =>
                    record(`${name} failed after ${elapsedMs()}ms: ${describe(failure)}`, 'warning')
                )
            )
        );
    });
}

function describe(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure);
}

function shutdownSteps(
    resources: HausServerShutdownResources
): ReadonlyArray<readonly [string, () => Promise<void> | void, ShutdownStepOptions?]> {
    return [
        ['database', () => resources.closeDatabase()],
        ['post-commit-work', () => resources.closePostCommitWork()],
        ['fastify', () => resources.closeFastify()],
        // Hosted processes stop in their own bounded step, so a stuck client close cannot hold them.
        ['hosted-mcps', () => resources.closeHostedMcps()],
        ['mcp-clients', () => resources.closeMcpClients(), { timeoutMs: mcpClientsStepTimeoutMs }],
        ['computer-socket', () => resources.closeComputerSocket()],
        ['http-connections', () => resources.closeHttpConnections()],
        ['websocket-server', () => resources.closeWebSocketServer()],
        ['recurring-work', () => resources.closeRecurringWork()],
        ['reconnect-broadcast', () => resources.broadcastReconnectNotification()],
    ];
}
