import { createHash } from 'node:crypto';
import type { HostToolSet } from '../../host-tools/host-tool.ts';
import type { HostToolServer, HostToolSession } from '../../host-tools/mcp-server.ts';
import type { OpenSessionOptions, RuntimeDriver } from '../driver.ts';
import type { RuntimeResumeState } from '../resume-state.ts';
import { openAppServer } from './app-server.ts';
import {
    type CodexExecutable,
    codexPinFingerprint,
    resolvePinnedCodex,
} from './codex-executable.ts';
import {
    type CodexLaunchFacts,
    codexHomeFor,
    codexProcessEnv,
    prepareCodexHome,
} from './codex-launch.ts';
import { CodexSession, type CodexSessionHooks } from './codex-session.ts';
import {
    type CodexProcessLaunch,
    type CodexTransport,
    spawnCodexProcess,
} from './codex-transport.ts';

export interface CodexDriverOptions extends CodexLaunchFacts {
    /** The Computer's host-tool MCP server; each session opens its own bearer-scoped tools. */
    readonly hostToolServer: Pick<HostToolServer, 'openSession'>;
    /** Registers a live app-server with Computer shutdown; returns its unregister. */
    readonly registerProcess?: (close: () => Promise<void>) => () => void;
    /** Test seams: the Codex binary and the process transport. */
    readonly resolveExecutable?: (signal?: AbortSignal) => Promise<CodexExecutable>;
    readonly spawn?: (launch: CodexProcessLaunch) => CodexTransport;
    readonly tools: HostToolSet;
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

/** Parked app-servers by CODEX_HOME: at most one live process per Agent. */
const parked = new Map<string, { launchKey: string; session: CodexSession }>();

async function openCodexSession(
    options: CodexDriverOptions,
    resolveExecutable: (signal?: AbortSignal) => Promise<CodexExecutable>,
    open: OpenSessionOptions
): Promise<CodexSession> {
    const threadId = resumeThreadId(open.resumeFrom);
    const executable = await resolveExecutable(open.signal);
    const home = codexHomeFor(options.homeDir);
    const launchKey = launchKeyOf(options, executable);
    const warm = parked.get(home);
    parked.delete(home);
    if (
        warm?.session.alive &&
        warm.launchKey === launchKey &&
        warm.session.sessionId === threadId
    ) {
        warm.session.server.hostTools.replaceTools(options.tools);
        return warm.session.reopen();
    }
    // A second app-server on the same thread would be refused as a busy writer.
    await warm?.session.destroy();
    open.signal?.throwIfAborted();
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
    const unregister = options.registerProcess?.(() => transport.kill()) ?? (() => undefined);
    let released: Promise<void> | null = null;
    const hooks: CodexSessionHooks = {
        park: (session) => parked.set(home, { launchKey, session }),
        release: (session) => {
            if (parked.get(home)?.session === session) {
                parked.delete(home);
            }
            released ??= transport.kill().finally(() => {
                hostTools.close();
                unregister();
            });
            return released;
        },
    };
    try {
        const server = await openAppServer({
            facts: options,
            hostTools,
            resumeThreadId: threadId,
            transport,
        });
        return new CodexSession(server, hooks, options.workspaceDir);
    } catch (error) {
        await transport.kill().finally(() => {
            hostTools.close();
            unregister();
        });
        throw error;
    }
}

/**
 * The Codex thread a stored state resumes. A legacy AI SDK harness state carries codex-acp's
 * session id, which is the app-server thread id, under `data.acpSessionId`. The errors use the
 * words `isResumeRejection` already treats as unusable lifecycle state.
 */
export function resumeThreadId(state: RuntimeResumeState | undefined): string | undefined {
    if (!state) {
        return;
    }
    if (state.runtime === 'codex' && typeof state.threadId === 'string') {
        return state.threadId;
    }
    if ('runtime' in state && 'version' in state) {
        throw new Error(
            `Lifecycle state was produced by harness ${String(state.runtime)}, not codex.`
        );
    }
    const data = state.data as { acpSessionId?: unknown } | undefined;
    if (
        state.harnessId === 'codex' &&
        typeof data?.acpSessionId === 'string' &&
        data.acpSessionId
    ) {
        return data.acpSessionId;
    }
    throw new Error('ACP lifecycle state data is missing a Codex thread id.');
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
