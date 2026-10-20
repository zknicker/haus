import type { HostToolSession } from '../../host-tools/mcp-server.ts';
import { JsonRpcRequestError } from '../json-rpc.ts';
import { CodexConnection, type CodexInbound } from './codex-connection.ts';
import {
    CodexResumeRejectedError,
    CodexThreadBusyError,
    classifyResumeRefusal,
} from './codex-errors.ts';
import { type CodexLaunchFacts, codexMcpServers, codexThreadParams } from './codex-launch.ts';
import type { CodexTransport } from './codex-transport.ts';
import { initializeResultSchema, mcpStartupParamsSchema, threadResultSchema } from './protocol.ts';
import { answerCodexServerRequest } from './server-requests.ts';

/** Whether the host-tool MCP server came up for the thread. */
export type HostToolsStatus =
    | { readonly ok: true }
    | { readonly error: string; readonly ok: false };

/** One app-server process with its Agent thread open. */
export interface CodexAppServer {
    readonly connection: CodexConnection;
    readonly hostTools: HostToolSession;
    readonly hostToolsReady: Promise<HostToolsStatus>;
    readonly resumed: boolean;
    /** Routes every later notification and foreign line. */
    route(listener: (message: CodexInbound) => void, onInvalidLine: (line: string) => void): void;
    readonly threadId: string;
}

export interface OpenAppServerInput {
    readonly facts: CodexLaunchFacts;
    readonly hostTools: HostToolSession;
    readonly resumeThreadId: string | undefined;
    readonly transport: CodexTransport;
}

/** Bounds the wait for the host-tool MCP server before the first turn starts without it. */
const HOST_TOOLS_READY_MS = 30_000;
const CLIENT_INFO = { name: 'haus-computer', title: 'Haus Computer', version: '1' };

/**
 * initialize → initialized → `config/read` (to disable every config-layer MCP server) →
 * `thread/start` or `thread/resume`. An archived thread is unarchived and resumed once (Raft
 * task #14); a missing rollout or a busy writer is a resume rejection.
 */
export async function openAppServer(input: OpenAppServerInput): Promise<CodexAppServer> {
    let listener: ((message: CodexInbound) => void) | null = null;
    let invalid: (line: string) => void = () => undefined;
    const hostToolName = input.hostTools.mcp.name;
    const ready = Promise.withResolvers<HostToolsStatus>();
    const connection = new CodexConnection(input.transport, answerCodexServerRequest, (line) =>
        invalid(line)
    );
    connection.listen((message) => {
        const status =
            message.kind === 'notification' ? hostToolStatus(message, hostToolName) : null;
        if (status) {
            ready.resolve(status);
        }
        listener?.(message);
    });
    void connection.exited.then((error) => ready.resolve({ error: error.message, ok: false }));
    const initialized = initializeResultSchema.safeParse(
        await connection.request('initialize', {
            capabilities: { experimentalApi: true },
            clientInfo: CLIENT_INFO,
        })
    );
    if (!initialized.success) {
        throw new Error(
            'The Codex app-server answered initialize without a userAgent; it is not a compatible app-server build.'
        );
    }
    await connection.notify('initialized', {});
    const configRead = await connection.request('config/read', {
        cwd: input.facts.workspaceDir,
        includeLayers: true,
    });
    const params = codexThreadParams(input.facts, codexMcpServers(configRead, input.hostTools.mcp));
    const threadId = input.resumeThreadId
        ? await resumeThread(connection, input.resumeThreadId, params)
        : await startThread(connection, params);
    return {
        connection,
        hostTools: input.hostTools,
        hostToolsReady: withTimeout(ready.promise, HOST_TOOLS_READY_MS),
        resumed: input.resumeThreadId !== undefined,
        route(next, onInvalidLine) {
            listener = next;
            invalid = onInvalidLine;
        },
        threadId,
    };
}

async function startThread(connection: CodexConnection, params: Record<string, unknown>) {
    return threadIdOf(await connection.request('thread/start', params));
}

async function resumeThread(
    connection: CodexConnection,
    threadId: string,
    params: Record<string, unknown>
): Promise<string> {
    const resume = { ...params, excludeTurns: true, threadId };
    try {
        return threadIdOf(await connection.request('thread/resume', resume));
    } catch (error) {
        const reason = refusal(error);
        if (reason === 'archived') {
            await connection.request('thread/unarchive', { threadId }).catch((cause: unknown) => {
                throw new CodexResumeRejectedError(threadId, 'archived', { cause });
            });
            return threadIdOf(await connection.request('thread/resume', resume));
        }
        if (reason === 'thread-writer-busy') {
            throw new CodexThreadBusyError(threadId, { cause: error });
        }
        throw reason ? new CodexResumeRejectedError(threadId, reason, { cause: error }) : error;
    }
}

function refusal(error: unknown) {
    return error instanceof JsonRpcRequestError ? classifyResumeRefusal(error.detail) : null;
}

function threadIdOf(result: unknown): string {
    const parsed = threadResultSchema.safeParse(result);
    if (!parsed.success) {
        throw new Error(`The Codex app-server returned no thread: ${parsed.error.message}`);
    }
    return parsed.data.thread.id;
}

function hostToolStatus(
    message: Extract<CodexInbound, { kind: 'notification' }>,
    name: string
): HostToolsStatus | null {
    if (message.method !== 'mcpServer/startupStatus/updated') {
        return null;
    }
    const parsed = mcpStartupParamsSchema.safeParse(message.params);
    if (!parsed.success || parsed.data.name !== name) {
        return null;
    }
    switch (parsed.data.status) {
        case 'ready':
            return { ok: true };
        case 'failed':
        case 'cancelled':
            return { error: parsed.data.error ?? parsed.data.status, ok: false };
        default:
            return null;
    }
}

async function withTimeout(promise: Promise<HostToolsStatus>, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<HostToolsStatus>((resolve) => {
        timer = setTimeout(
            () => resolve({ error: `not ready after ${ms / 1000}s`, ok: false }),
            ms
        );
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
