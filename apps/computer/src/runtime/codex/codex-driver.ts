import { createHash } from 'node:crypto';
import type { HostToolSet } from '../../host-tools/host-tool.ts';
import type { HostToolServer, HostToolSession } from '../../host-tools/mcp-server.ts';
import type { OpenSessionOptions, RuntimeDriver } from '../driver.ts';
import { handshakeDeadline } from '../handshake-deadline.ts';
import { toHausResumeState } from '../legacy-resume-state.ts';
import type { RuntimeProcessRegistry } from '../process-registry.ts';
import type { RuntimeResumeState } from '../resume-state.ts';
import type { WarmProcess, WarmSlot } from '../warm-pool.ts';
import { openAppServer } from './app-server.ts';
import {
    type CodexExecutable,
    codexPinFingerprint,
    resolvePinnedCodex,
} from './codex-executable.ts';
import { type CodexLaunchFacts, codexProcessEnv, prepareCodexHome } from './codex-launch.ts';
import { CodexSession, type CodexSessionHooks } from './codex-session.ts';
import {
    type CodexProcessLaunch,
    type CodexTransport,
    spawnCodexProcess,
} from './codex-transport.ts';

export interface CodexDriverOptions extends CodexLaunchFacts {
    /** Bounds the app-server handshake; defaults to `RUNTIME_HANDSHAKE_TIMEOUT_MS`. */
    readonly handshakeTimeoutMs?: number;
    /** The Computer's host-tool MCP server; each session opens its own bearer-scoped tools. */
    readonly hostToolServer: Pick<HostToolServer, 'openSession'>;
    /** Ties every app-server to Computer shutdown. */
    readonly processes?: RuntimeProcessRegistry;
    /** Test seams: the Codex binary and the process transport. */
    readonly resolveExecutable?: (signal?: AbortSignal) => Promise<CodexExecutable>;
    readonly spawn?: (launch: CodexProcessLaunch) => CodexTransport;
    readonly tools: HostToolSet;
    /** Where the session parks its app-server between turns. */
    readonly warm: WarmSlot;
}

/**
 * Codex on `codex app-server --listen stdio://`, one process per Agent: every Agent has its own
 * CODEX_HOME, and the app-server reads config and login per process. `detach` parks the process
 * warm with its thread loaded, so the Agent's next turn reuses it when its launch facts match;
 * otherwise the next open resumes the thread on a fresh process.
 */
export function createCodexDriver(options: CodexDriverOptions): RuntimeDriver {
    const resolveExecutable = options.resolveExecutable ?? resolvePinnedCodex;
    return {
        bootstrapFingerprint: () => Promise.resolve(codexPinFingerprint),
        openSession: (open) => openCodexSession(options, resolveExecutable, open),
        refreshBootstrap: async ({ signal }) => {
            await resolveExecutable(signal);
        },
        runtimeId: 'codex',
    };
}

async function openCodexSession(
    options: CodexDriverOptions,
    resolveExecutable: (signal?: AbortSignal) => Promise<CodexExecutable>,
    open: OpenSessionOptions
): Promise<CodexSession> {
    const threadId = resumeThreadId(open.resumeFrom);
    const executable = await resolveExecutable(open.signal);
    const launchKey = launchKeyOf(options, executable);
    const { key, pool } = options.warm;
    // A second app-server on the same thread would be refused as a busy writer, so whatever is
    // parked for this Agent and cannot take the open is closed first.
    const warm = threadId
        ? await pool.claim(
              key,
              { launchKey, nativeSessionId: threadId, runtimeId: 'codex' },
              isCodexSession
          )
        : undefined;
    if (warm) {
        warm.server.hostTools.replaceTools(options.tools);
        return warm.reopen();
    }
    if (!threadId) {
        await pool.evict(key);
    }
    open.signal?.throwIfAborted();
    options.processes?.assertOpen();
    await prepareCodexHome(options);
    const hostTools = options.hostToolServer.openSession(options.tools);
    const transport = (options.spawn ?? spawnCodexProcess)({
        args: ['app-server', '--listen', 'stdio://'],
        cwd: options.workspaceDir,
        env: codexProcessEnv(options, {
            hostToolToken: bearerToken(hostTools),
            managed: executable.env,
        }),
        executable: executable.path,
    });
    const stop = () => transport.kill();
    options.processes?.add(stop);
    let released: Promise<void> | null = null;
    const release = () => {
        // The bearer scope dies with the process, even when its group outlives the kill; the
        // registry keeps a group that did not end, so Computer shutdown retries it.
        released ??= transport
            .kill()
            .finally(() => hostTools.close())
            .then(() => options.processes?.remove(stop));
        return released;
    };
    const hooks: CodexSessionHooks = {
        park: (session) =>
            pool.park(
                key,
                { launchKey, nativeSessionId: session.sessionId, runtimeId: 'codex' },
                session
            ),
        release,
    };
    const deadline = handshakeDeadline(
        'The Codex app-server',
        open.signal,
        options.handshakeTimeoutMs
    );
    try {
        const server = await openAppServer({
            facts: options,
            hostTools,
            resumeThreadId: threadId,
            signal: deadline.signal,
            transport,
        });
        return new CodexSession(server, hooks, options.workspaceDir);
    } catch (error) {
        await release();
        throw error;
    } finally {
        deadline.clear();
    }
}

/** The Codex thread a stored state resumes; legacy harness state converts on first open. */
export function resumeThreadId(state: RuntimeResumeState | undefined): string | undefined {
    return state ? toHausResumeState('codex', state).threadId : undefined;
}

function isCodexSession(process: WarmProcess): process is CodexSession {
    return process instanceof CodexSession;
}

function bearerToken(session: HostToolSession): string {
    return session.mcp.headers.Authorization.replace(/^Bearer\s+/u, '');
}

/** Facts fixed at spawn: a parked process is reused only when all of them still hold. */
function launchKeyOf(facts: CodexLaunchFacts, executable: CodexExecutable): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                env: Object.entries(facts.env).sort(([a], [b]) => a.localeCompare(b)),
                executable: executable.path,
                hostHomeDir: facts.hostHomeDir ?? null,
                instructions: facts.instructions,
                modelId: facts.modelId,
                reasoningEffort: facts.reasoningEffort,
                workspaceDir: facts.workspaceDir,
            })
        )
        .digest('hex');
}
