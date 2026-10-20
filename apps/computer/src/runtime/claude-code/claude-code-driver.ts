import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentReasoningEffort } from '@haus/api';
import type { DaemonRuntime } from '../../daemon-runtime.ts';
import type { HostToolSet } from '../../host-tools/host-tool.ts';
import type { HostToolServer } from '../../host-tools/mcp-server.ts';
import type { RuntimeDriver } from '../driver.ts';
import { ClaudeConnection } from './claude-connection.ts';
import { resolveClaudeCredentials } from './claude-credentials.ts';
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
import { type ClaudeWarmPool, claudeWarmPool } from './claude-warm-pool.ts';

export interface ClaudeCodeDriverOptions {
    /** Test seams: a stand-in CLI, credentials, the Computer env, and an isolated pool. */
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
    pool?: ClaudeWarmPool;
    reasoningEffort: AgentReasoningEffort;
    /** Ties every process to Computer shutdown. */
    runtime?: DaemonRuntime;
    tools: HostToolSet;
    workspaceDir: string;
}

/**
 * The Claude Code runtime driver: the `claude` CLI spoken directly over stream-json, one
 * long-lived process per Agent session, parked warm between turns (specs/runtime-drivers.md).
 */
export function createClaudeCodeDriver(options: ClaudeCodeDriverOptions): RuntimeDriver {
    const pool = options.pool ?? claudeWarmPool;
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
        if (input.resumeSessionId) {
            const warm = pool.take(input.resumeSessionId);
            if (warm?.launchKey === launchKey) {
                warm.hostTools.replaceTools(options.tools);
                return warm;
            }
            // Launch facts changed (instructions, model, effort, env, login): resume anew.
            await warm?.stop();
        }
        input.signal?.throwIfAborted();
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
                runtime: options.runtime,
            });
            const normalizer = new ClaudeEventNormalizer({
                hostServer: hostTools.mcp.name,
                strip: createWorkspaceStripper([
                    options.workspaceDir,
                    realPath(options.workspaceDir),
                ]),
            });
            return new ClaudeConnection(child, normalizer, hostTools, launchKey, sessionId);
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
                pool,
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

function realPath(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        // A workspace that does not exist yet has no other spelling to strip.
        return path;
    }
}
