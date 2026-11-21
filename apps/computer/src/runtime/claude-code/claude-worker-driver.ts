import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import type { WorkerQuestions } from '@haus/api';
import type { RuntimeDriver } from '../driver.ts';
import type { RuntimeProcessRegistry } from '../process-registry.ts';
import { ClaudeConnection } from './claude-connection.ts';
import { claudeInitializeFailure } from './claude-errors.ts';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import {
    CLAUDE_CODE_VERSION,
    type ClaudeInstallTarget,
    claudeInstallTarget,
    ensureClaudeInstall,
} from './claude-install.ts';
import { spawnClaudeProcess } from './claude-process.ts';
import { claudeResumeSessionId } from './claude-resume.ts';
import { createClaudeSession } from './claude-session.ts';
import { claudeToolGate } from './claude-tool-gate.ts';
import { createWorkspaceStripper } from './claude-tool-names.ts';

/** The oldest Claude Code whose `can_use_tool` capture and interrupting deny Haus has proven. */
export const claudeWorkerQuestionsMinVersion = '2.1.317';

const CLAUDE_DISALLOWED_TOOLS = [
    'EnterPlanMode',
    'ExitPlanMode',
    'ScheduleWakeup',
    'CronCreate',
    'CronList',
    'CronDelete',
    'AskUserQuestion',
    'Monitor',
    'RemoteTrigger',
    'PushNotification',
] as const;

const CLAUDE_ALLOWED_TOOLS = ['Glob', 'Grep'] as const;

export interface ClaudeWorkerDriverOptions {
    baseEnv?: NodeJS.ProcessEnv;
    binaryPath?: string;
    cwd: string;
    env: Readonly<Record<string, string>>;
    /** The CLI's version; the pinned release unless `binaryPath` names another binary. */
    harnessVersion?: string;
    homeDir: string;
    installTarget?: ClaudeInstallTarget;
    modelId: string | null;
    processes?: RuntimeProcessRegistry;
}

export function createClaudeWorkerDriver(options: ClaudeWorkerDriverOptions) {
    const target = options.binaryPath ? null : (options.installTarget ?? claudeInstallTarget());
    const questionsReady = claudeWorkerAsks(
        options.harnessVersion ?? (options.binaryPath ? null : CLAUDE_CODE_VERSION)
    );
    const connect = async (input: {
        onQuestion?: (questions: WorkerQuestions) => Promise<void>;
        resumeSessionId?: string;
        signal?: AbortSignal;
    }) => {
        const onQuestion = questionsReady ? input.onQuestion : undefined;
        const binaryPath =
            options.binaryPath ??
            (await ensureClaudeInstall(requireTarget(target), { signal: input.signal }));
        input.signal?.throwIfAborted();
        const sessionId = input.resumeSessionId ?? randomUUID();
        const child = spawnClaudeProcess({
            args: buildClaudeWorkerArgs({
                asks: onQuestion !== undefined,
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
            sessionId,
            claudeToolGate(onQuestion)
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
        async openSession({ onQuestion, resumeFrom, signal }) {
            const resumeSessionId = claudeResumeSessionId(resumeFrom);
            return createClaudeSession({
                connection: await connect({ onQuestion, resumeSessionId, signal }),
                isResume: resumeSessionId !== undefined,
                relaunch: (claudeSessionId) =>
                    connect({ onQuestion, resumeSessionId: claudeSessionId }),
            });
        },
    } satisfies RuntimeDriver;
}

export function buildClaudeWorkerArgs(launch: {
    asks: boolean;
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
        ...(launch.asks ? ['--permission-prompt-tool', 'stdio'] : []),
        '--allowedTools',
        CLAUDE_ALLOWED_TOOLS.join(','),
        '--disallowedTools',
        CLAUDE_DISALLOWED_TOOLS.filter((tool) => !(launch.asks && tool === 'AskUserQuestion')).join(
            ','
        ),
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

/** Whether this Claude Code version can carry Worker questions; below the minimum they stay off. */
export function claudeWorkerAsks(version: string | null) {
    return version !== null && compareVersions(version, claudeWorkerQuestionsMinVersion) >= 0;
}

function compareVersions(left: string, right: string) {
    const parts = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10));
    const [a, b] = [parts(left), parts(right)];
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const difference = (a[index] ?? 0) - (b[index] ?? 0);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
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
