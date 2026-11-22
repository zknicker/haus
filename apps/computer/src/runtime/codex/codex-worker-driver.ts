import type { OpenSessionOptions, RuntimeDriver } from '../driver.ts';
import { handshakeDeadline } from '../handshake-deadline.ts';
import type { RuntimeProcessRegistry } from '../process-registry.ts';
import { type RuntimeResumeState, resumeStateFor } from '../resume-state.ts';
import { openAppServer } from './app-server.ts';
import { CODEX_CLI_VERSION, type CodexExecutable, resolvePinnedCodex } from './codex-executable.ts';
import { CodexSession } from './codex-session.ts';
import {
    type CodexProcessLaunch,
    type CodexTransport,
    spawnCodexProcess,
} from './codex-transport.ts';

export interface CodexWorkerDriverOptions {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly handshakeTimeoutMs?: number;
    readonly homeDir: string;
    readonly modelId: string | null;
    readonly processes?: RuntimeProcessRegistry;
    readonly resolveExecutable?: (signal?: AbortSignal) => Promise<CodexExecutable>;
    readonly spawn?: (launch: CodexProcessLaunch) => CodexTransport;
    readonly writableRoots: readonly string[];
}

export function createCodexWorkerDriver(options: CodexWorkerDriverOptions) {
    const resolveExecutable = options.resolveExecutable ?? resolvePinnedCodex;
    return {
        openSession: (open) => openWorkerSession(options, resolveExecutable, open),
    } satisfies RuntimeDriver;
}

export function resumeThreadId(state: RuntimeResumeState | undefined) {
    return state ? resumeStateFor('codex', state).threadId : undefined;
}

export const codexWorkerQuestionVersions: readonly string[] = ['0.159.0'];

export function codexWorkerAsks(version: string) {
    return codexWorkerQuestionVersions.includes(version);
}

export function codexWorkerThreadParams(
    options: Pick<CodexWorkerDriverOptions, 'cwd' | 'modelId' | 'writableRoots'>,
    asks = false
) {
    return {
        approvalPolicy: 'never',
        config: {
            ...(asks
                ? {
                      features: { default_mode_request_user_input: true },
                      suppress_unstable_features_warning: true,
                  }
                : {}),
            sandbox_workspace_write: {
                exclude_slash_tmp: true,
                exclude_tmpdir_env_var: true,
                network_access: true,
                writable_roots: [...options.writableRoots],
            },
        },
        cwd: options.cwd,
        ...(options.modelId ? { model: options.modelId } : {}),
        sandbox: 'workspace-write',
    };
}

export function codexWorkerEnv(
    options: Pick<CodexWorkerDriverOptions, 'env' | 'homeDir'>,
    managed: Readonly<Record<string, string>>,
    base: NodeJS.ProcessEnv = process.env
) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(base)) {
        if (value !== undefined && !key.startsWith('CODEX_MANAGED_')) {
            env[key] = value;
        }
    }
    return Object.assign(env, managed, options.env, { HOME: options.homeDir, NO_BROWSER: '1' });
}

async function openWorkerSession(
    options: CodexWorkerDriverOptions,
    resolveExecutable: (signal?: AbortSignal) => Promise<CodexExecutable>,
    open: OpenSessionOptions
) {
    const executable = await resolveExecutable(open.signal);
    open.signal?.throwIfAborted();
    const onQuestion = codexWorkerAsks(CODEX_CLI_VERSION) ? open.onQuestion : undefined;
    options.processes?.assertOpen();
    const transport = (options.spawn ?? spawnCodexProcess)({
        args: ['app-server', '--listen', 'stdio://'],
        cwd: options.cwd,
        env: codexWorkerEnv(options, executable.env),
        executable: executable.path,
    });
    const stop = () => transport.kill();
    options.processes?.add(stop);
    let released: Promise<void> | null = null;
    const release = () => {
        released ??= transport.kill().then(() => options.processes?.remove(stop));
        return released;
    };
    const deadline = handshakeDeadline(
        'The Codex app-server',
        open.signal,
        options.handshakeTimeoutMs
    );
    try {
        const server = await openAppServer({
            cwd: options.cwd,
            resumeThreadId: resumeThreadId(open.resumeFrom),
            signal: deadline.signal,
            threadParams: () => codexWorkerThreadParams(options, onQuestion !== undefined),
            transport,
        });
        return new CodexSession(server, release, options.cwd, onQuestion);
    } catch (error) {
        await release();
        throw error;
    } finally {
        deadline.clear();
    }
}
