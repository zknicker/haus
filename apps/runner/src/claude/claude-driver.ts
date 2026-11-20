import type {
    OpenSessionOptions,
    RuntimeDriverFactory,
    RuntimeLaunch,
    RuntimeSession,
    SteerResult,
} from '../turn/runtime-driver.ts';
import { warmIdleMs } from '../turn/warm-pool.ts';
import { ClaudeConnection } from './claude-connection.ts';
import {
    claudeBootstrapFingerprint,
    claudeLaunchFacts,
    claudeLaunchKey,
    claudePaths,
    claudeQueryOptions,
} from './claude-launch.ts';
import { ClaudeTurn } from './claude-turn.ts';
import { CompactingPool } from './compacting-pool.ts';
import type { IdleCompactionHooks } from './idle-compaction-scheduler.ts';
import { type IdleCompactionOwner, idleCompactionMinTokens } from './idle-compaction.ts';

const expiryIntervalMs = 60_000;

export function createClaudeHarness(options: {
    env?: Readonly<Record<string, string | undefined>>;
    hooks: IdleCompactionHooks<ClaudeConnection>;
    maxWarm: number;
}) {
    const minTokens = idleCompactionMinTokens(options.env ?? process.env);
    const pool = new CompactingPool<ClaudeConnection>({
        hooks: options.hooks,
        idleMs: warmIdleMs,
        maxWarm: options.maxWarm,
    });
    const closeAll = (connections: readonly ClaudeConnection[]) => {
        for (const connection of connections) {
            connection.close();
        }
        return Promise.all(connections.map((connection) => connection.ended));
    };
    const expiry = setInterval(() => closeAll(pool.expire(Date.now())), expiryIntervalMs);
    expiry.unref();
    let bootstrap: Promise<string> | null = null;
    const bootstrapFingerprint = () => {
        bootstrap ??= claudeBootstrapFingerprint();
        return bootstrap;
    };

    const connect = async (launch: RuntimeLaunch, resumeFrom: string | undefined) => {
        const paths = claudePaths(launch.agentDir);
        const facts = claudeLaunchFacts(launch, await bootstrapFingerprint());
        const launchKey = claudeLaunchKey(facts);
        if (resumeFrom) {
            const claim = await pool.claim(
                launch.agentId,
                { launchKey, nativeSessionId: resumeFrom },
                Date.now()
            );
            closeAll(claim.closing);
            if (claim.process?.alive) {
                return claim.process;
            }
        } else {
            closeAll(pool.take(launch.agentId));
        }
        const sessionId = resumeFrom ?? crypto.randomUUID();
        return await ClaudeConnection.open({
            launchKey,
            minTokens,
            options: claudeQueryOptions(facts, {
                cwd: paths.homeDir,
                sessionId,
                ...(resumeFrom ? { resume: resumeFrom } : {}),
            }),
            sessionId,
        });
    };

    const driver = (launch: RuntimeLaunch) => ({
        bootstrapFingerprint,
        harness: 'claude-agent-sdk' as const,
        instructionsOnResume: 'launched' as const,
        async openSession({ resumeFrom, signal }: OpenSessionOptions) {
            signal?.throwIfAborted();
            const connection = await connect(launch, resumeFrom);
            connection.binding.bind(launch.tools);
            connection.owner = owner(launch);
            return claudeSession({
                connection,
                isResume: resumeFrom !== undefined,
                park: (parked) =>
                    closeAll(
                        pool.park(
                            launch.agentId,
                            { launchKey: parked.launchKey, nativeSessionId: parked.sessionId },
                            parked,
                            Date.now()
                        )
                    ),
                relaunch: async (nativeSessionId) => {
                    const next = await connect(launch, nativeSessionId);
                    next.binding.bind(launch.tools);
                    next.owner = owner(launch);
                    return next;
                },
            });
        },
    });
    const factory: RuntimeDriverFactory = driver;

    return {
        close() {
            clearInterval(expiry);
            closeAll(pool.drain());
        },
        release(agentId: string) {
            return closeAll(pool.take(agentId));
        },
        driver,
        factory,
        setIdleCompaction(enabled: boolean) {
            pool.setIdleCompaction(enabled);
        },
        get warm() {
            return pool.size;
        },
    };
}

function owner(launch: RuntimeLaunch) {
    if (!launch.runtimeId) {
        return null;
    }
    const idleOwner: IdleCompactionOwner = {
        agentDir: launch.agentDir,
        agentId: launch.agentId,
        runtimeId: launch.runtimeId,
    };
    return idleOwner;
}

function claudeSession(deps: {
    connection: ClaudeConnection;
    isResume: boolean;
    park(connection: ClaudeConnection): void;
    relaunch(nativeSessionId: string): Promise<ClaudeConnection>;
}) {
    let connection = deps.connection;
    let turn: ClaudeTurn | null = null;
    let closed = false;
    const idle = async () => {
        await turn?.settle();
        turn = null;
    };
    const session: RuntimeSession & { readonly initTools: readonly string[] } = {
        destroy() {
            closed = true;
            connection.binding.tools = null;
            connection.close();
            return Promise.resolve();
        },
        async detach() {
            await idle();
            closed = true;
            connection.binding.tools = null;
            if (connection.alive) {
                deps.park(connection);
            }
            return connection.sessionId;
        },
        get initTools() {
            return connection.initTools;
        },
        isResume: deps.isResume,
        get sessionId() {
            return connection.sessionId;
        },
        async startTurn({ prompt, signal }) {
            if (closed) {
                throw new Error('The Claude session is parked.');
            }
            if (turn && !turn.isSettled) {
                throw new Error('A Claude turn is already running.');
            }
            if (!connection.alive) {
                connection = await deps.relaunch(connection.sessionId);
            }
            const next = new ClaudeTurn(connection, signal);
            turn = next;
            next.start(prompt);
            return {
                events: next.events,
                settle: () => next.settle(),
                unconsumedSteers: () => next.unconsumedSteers(),
            };
        },
        steer(text) {
            if (!turn || turn.isSettled) {
                const idleResult: SteerResult = { delivered: false, reason: 'idle' };
                return Promise.resolve(idleResult);
            }
            return turn.steer(text);
        },
        async stop() {
            await idle();
            closed = true;
            connection.binding.tools = null;
            connection.close();
            return connection.sessionId;
        },
    };
    return session;
}
