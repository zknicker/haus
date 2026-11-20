import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import type { RuntimeDriver } from '../driver.ts';
import type { RuntimeProcessRegistry } from '../process-registry.ts';
import { ClaudeConnection } from './claude-connection.ts';
import { claudeInitializeFailure } from './claude-errors.ts';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import {
    type ClaudeInstallTarget,
    claudeInstallFingerprint,
    claudeInstallTarget,
    ensureClaudeInstall,
} from './claude-install.ts';
import { CLAUDE_ALLOWED_TOOLS, CLAUDE_DISALLOWED_TOOLS } from './claude-launch.ts';
import { spawnClaudeProcess } from './claude-process.ts';
import { claudeResumeSessionId } from './claude-resume.ts';
import { createClaudeSession } from './claude-session.ts';
import { createWorkspaceStripper } from './claude-tool-names.ts';

export interface ClaudeWorkerDriverOptions {
    baseEnv?: NodeJS.ProcessEnv;
    binaryPath?: string;
    cwd: string;
    env: Readonly<Record<string, string>>;
    homeDir: string;
    installTarget?: ClaudeInstallTarget;
    modelId: string | null;
    processes?: RuntimeProcessRegistry;
}

export function createClaudeWorkerDriver(options: ClaudeWorkerDriverOptions) {
    const target = options.binaryPath ? null : (options.installTarget ?? claudeInstallTarget());
    const connect = async (input: { resumeSessionId?: string; signal?: AbortSignal }) => {
        const binaryPath =
            options.binaryPath ??
            (await ensureClaudeInstall(requireTarget(target), { signal: input.signal }));
        input.signal?.throwIfAborted();
        const sessionId = input.resumeSessionId ?? randomUUID();
        const child = spawnClaudeProcess({
            args: buildClaudeWorkerArgs({
                modelId: options.modelId,
                ...(input.resumeSessionId ? { resumeSessionId: sessionId } : { sessionId }),
            }),
            binaryPath,
            cwd: options.cwd,
            env: buildClaudeWorkerEnv(options.baseEnv ?? process.env, options),
            processes: options.processes,
        });
        const normalizer = new ClaudeEventNormalizer({
            hostServer: 'haus',
            strip: createWorkspaceStripper([options.cwd, realPath(options.cwd)]),
        });
        const connection = new ClaudeConnection(
            child,
            normalizer,
            null,
            'worker',
            sessionId,
            undefined,
            { modelId: options.modelId ?? '' }
        );
        try {
            await connection.initialize();
        } catch (error) {
            await connection.stop();
            throw claudeInitializeFailure(error, child.stderrTail());
        }
        return connection;
    };
    return {
        bootstrapFingerprint: () =>
            Promise.resolve(target ? claudeInstallFingerprint(target) : null),
        async openSession({ resumeFrom, signal }) {
            const resumeSessionId = claudeResumeSessionId(resumeFrom);
            return createClaudeSession({
                collectPlanUsage: false,
                connection: await connect({ resumeSessionId, signal }),
                isResume: resumeSessionId !== undefined,
                park: (connection) => connection.stop(),
                relaunch: (claudeSessionId) => connect({ resumeSessionId: claudeSessionId }),
            });
        },
        async refreshBootstrap({ signal }) {
            if (target) {
                await ensureClaudeInstall(target, { signal });
            }
        },
        runtimeId: 'claude-code',
    } satisfies RuntimeDriver;
}

export function buildClaudeWorkerArgs(launch: {
    modelId: string | null;
    resumeSessionId?: string;
    sessionId?: string;
}) {
    return [
        '--output-format',
        'stream-json',
        '--input-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        ...(launch.modelId ? ['--model', launch.modelId] : []),
        '--permission-mode',
        'bypassPermissions',
        '--allow-dangerously-skip-permissions',
        '--setting-sources',
        'user,project,local',
        '--allowedTools',
        CLAUDE_ALLOWED_TOOLS.join(','),
        '--disallowedTools',
        CLAUDE_DISALLOWED_TOOLS.join(','),
        ...(launch.resumeSessionId
            ? ['--resume', launch.resumeSessionId]
            : launch.sessionId
              ? ['--session-id', launch.sessionId]
              : []),
    ];
}

export function buildClaudeWorkerEnv(
    base: NodeJS.ProcessEnv,
    options: Pick<ClaudeWorkerDriverOptions, 'env' | 'homeDir'>
) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(base)) {
        if (value !== undefined && key !== 'CLAUDECODE') {
            env[key] = value;
        }
    }
    return { ...env, ...options.env, CLAUDE_CODE_ENTRYPOINT: 'sdk-ts', HOME: options.homeDir };
}

function requireTarget(target: ClaudeInstallTarget | null) {
    if (!target) {
        throw new Error('No Claude Code install target is configured.');
    }
    return target;
}

function realPath(path: string) {
    try {
        return realpathSync(path);
    } catch {
        return path;
    }
}
