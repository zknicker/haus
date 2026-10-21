import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import type { HostToolSet } from '../../host-tools/host-tool.ts';
import type { HostToolServer } from '../../host-tools/mcp-server.ts';
import { unlinkHostClaudeState } from '../auth-profiles.ts';
import type { BackgroundWorkReports } from '../background-work.ts';
import type { RuntimeDriver } from '../driver.ts';
import type { RuntimeProcessRegistry } from '../process-registry.ts';
import type { WarmProcess, WarmSlot } from '../warm-pool.ts';
import { ClaudeConnection } from './claude-connection.ts';
import { resolveClaudeCredentials } from './claude-credentials.ts';
import { claudeInitializeFailure } from './claude-errors.ts';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import {
    type ClaudeInstallTarget,
    claudeInstallFingerprint,
    claudeInstallTarget,
    ensureClaudeInstall,
} from './claude-install.ts';
import {
    buildClaudeArgs,
    buildClaudeEnv,
    hostToolToken,
    renderClaudeMcpConfig,
    writeClaudeLaunchFiles,
} from './claude-launch.ts';
import { CLAUDE_USAGE_REFRESH_ENV } from './claude-plan-usage.ts';
import { spawnClaudeProcess } from './claude-process.ts';
import { claudeResumeSessionId } from './claude-resume.ts';
import { createClaudeSession } from './claude-session.ts';
import { createWorkspaceStripper } from './claude-tool-names.ts';

export interface ClaudeCodeDriverOptions {
    /** Hears the session's background sub-agents and the turns Claude Code starts for them. */
    background?: BackgroundWorkReports;
    /** Test seams: a stand-in CLI, credentials, and the Computer env. */
    baseEnv?: NodeJS.ProcessEnv;
    binaryPath?: string;
    credentials?: () => Promise<Record<string, string>>;
    /** The turn's launch env (Haus CLI, PATH, proxy); HOME is set to `homeDir`. */
    env: Readonly<Record<string, string>>;
    homeDir: string;
    /** The Computer's host-tool MCP server; each process gets its own scope. */
    hostToolServer: Pick<HostToolServer, 'openSession'>;
    installTarget?: ClaudeInstallTarget;
    /** The composed Agent instructions, appended to Claude Code's system prompt. */
    instructions: string;
    modelId: string;
    /** Ties every process to Computer shutdown. */
    processes?: RuntimeProcessRegistry;
    reasoningEffort: AgentReasoningEffort;
    tools: HostToolSet;
    /** Where the session parks its process between turns. */
    warm: WarmSlot;
    workspaceDir: string;
}

/**
 * The Claude Code runtime driver: the `claude` CLI spoken directly over stream-json, one
 * long-lived process per Agent session, parked warm between turns (specs/runtime-drivers.md).
 */
export function createClaudeCodeDriver(options: ClaudeCodeDriverOptions): RuntimeDriver {
    const { key: warmKey, pool } = options.warm;
    const target = options.binaryPath ? null : (options.installTarget ?? claudeInstallTarget());
    const collectPlanUsage = options.env[CLAUDE_USAGE_REFRESH_ENV] === '1';
    // The refresh flag changes per turn; it must not restart a warm process.
    const { [CLAUDE_USAGE_REFRESH_ENV]: _refresh, ...launchEnv } = options.env;
    const baseEnv = options.baseEnv ?? process.env;

    const connect = async (input: {
        resumeSessionId?: string;
        signal?: AbortSignal;
    }): Promise<ClaudeConnection> => {
        const binaryPath =
            options.binaryPath ??
            (await ensureClaudeInstall(requireTarget(target), { signal: input.signal }));
        const credentials = await (options.credentials ?? (() => hostCredentials(baseEnv)))();
        const launchKey = fingerprint({ binaryPath, credentials, launchEnv, options });
        // Launch facts changed (instructions, model, effort, env, login): the claim closes the
        // parked process and the conversation resumes in a new one. A fresh session closes it too.
        const warm = input.resumeSessionId
            ? await pool.claim(
                  warmKey,
                  { launchKey, nativeSessionId: input.resumeSessionId, runtimeId: 'claude-code' },
                  isClaudeConnection
              )
            : undefined;
        if (!input.resumeSessionId) {
            await pool.evict(warmKey);
        }
        if (warm) {
            warm.hostTools.replaceTools(options.tools);
            return warm;
        }
        input.signal?.throwIfAborted();
        // The Agent HOME keeps its own `.claude.json`; an old link to the operator's is dropped.
        await unlinkHostClaudeState(options.homeDir);
        const hostTools = options.hostToolServer.openSession(options.tools);
        try {
            const files = await writeClaudeLaunchFiles({
                dir: join(options.homeDir, '.haus-runtime', 'claude-code'),
                instructions: options.instructions,
                mcpConfig: renderClaudeMcpConfig(hostTools.mcp),
            });
            const sessionId = input.resumeSessionId ?? randomUUID();
            const child = spawnClaudeProcess({
                args: buildClaudeArgs({
                    binaryPath,
                    ...files,
                    modelId: options.modelId,
                    reasoningEffort: options.reasoningEffort,
                    ...(input.resumeSessionId ? { resumeSessionId: sessionId } : { sessionId }),
                }),
                binaryPath,
                cwd: options.workspaceDir,
                env: buildClaudeEnv({
                    base: baseEnv,
                    credentials,
                    homeDir: options.homeDir,
                    hostToolToken: hostToolToken(hostTools.mcp),
                    launchEnv,
                }),
                processes: options.processes,
            });
            const normalizer = new ClaudeEventNormalizer({
                hostServer: hostTools.mcp.name,
                strip: createWorkspaceStripper([
                    options.workspaceDir,
                    realPath(options.workspaceDir),
                ]),
            });
            const background = options.background;
            const connection = new ClaudeConnection(
                child,
                normalizer,
                hostTools,
                launchKey,
                sessionId,
                background && {
                    changed: (work) => background.changed(warmKey, work),
                    lost: () => background.lost(warmKey),
                    wake: () => background.wake(warmKey),
                }
            );
            try {
                await connection.initialize();
            } catch (error) {
                await connection.stop();
                throw claudeInitializeFailure(error, child.stderrTail());
            }
            return connection;
        } catch (error) {
            hostTools.close();
            throw error;
        }
    };

    return {
        bootstrapFingerprint: () =>
            Promise.resolve(target ? claudeInstallFingerprint(target) : null),
        async openSession({ resumeFrom, signal }) {
            const resumeSessionId = claudeResumeSessionId(resumeFrom);
            const connection = await connect({ resumeSessionId, signal });
            return createClaudeSession({
                collectPlanUsage,
                connection,
                isResume: resumeSessionId !== undefined,
                park: (parked) =>
                    pool.park(
                        warmKey,
                        {
                            launchKey: parked.launchKey,
                            nativeSessionId: parked.sessionId,
                            runtimeId: 'claude-code',
                        },
                        parked
                    ),
                relaunch: (claudeSessionId) => connect({ resumeSessionId: claudeSessionId }),
            });
        },
        async refreshBootstrap({ signal }) {
            if (target) {
                await ensureClaudeInstall(target, { signal });
            }
        },
        runtimeId: 'claude-code',
    };
}

function hostCredentials(env: NodeJS.ProcessEnv) {
    return resolveClaudeCredentials({
        env,
        hostHomeDir: env.HAUS_COMPUTER_HOST_HOME ?? env.HOME,
    });
}

function requireTarget(target: ClaudeInstallTarget | null): ClaudeInstallTarget {
    if (!target) {
        throw new Error('No Claude Code install target is configured.');
    }
    return target;
}

/** Everything a warm process was launched with; any change relaunches it with `--resume`. */
function fingerprint(input: {
    binaryPath: string;
    credentials: Record<string, string>;
    launchEnv: Record<string, string>;
    options: ClaudeCodeDriverOptions;
}): string {
    return createHash('sha256')
        .update(
            JSON.stringify([
                input.binaryPath,
                input.credentials,
                Object.entries(input.launchEnv).sort(),
                input.options.homeDir,
                input.options.instructions,
                input.options.modelId,
                input.options.reasoningEffort,
                input.options.workspaceDir,
            ])
        )
        .digest('hex');
}

function isClaudeConnection(process: WarmProcess): process is ClaudeConnection {
    return process instanceof ClaudeConnection;
}

function realPath(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        // A workspace that does not exist yet has no other spelling to strip.
        return path;
    }
}
