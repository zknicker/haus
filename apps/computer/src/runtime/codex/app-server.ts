import { JsonRpcRequestError } from '../json-rpc.ts';
import { CodexConnection, type CodexInbound } from './codex-connection.ts';
import {
    CodexResumeRejectedError,
    CodexThreadBusyError,
    classifyResumeRefusal,
} from './codex-errors.ts';
import type { CodexTransport } from './codex-transport.ts';
import { initializeResultSchema, threadResultSchema } from './protocol.ts';
import { answerCodexServerRequest } from './server-requests.ts';

/** One app-server process with its thread open. */
export interface CodexAppServer {
    readonly connection: CodexConnection;
    readonly resumed: boolean;
    /** Routes every later notification and foreign line. */
    route(listener: (message: CodexInbound) => void, onInvalidLine: (line: string) => void): void;
    readonly threadId: string;
}

export interface OpenAppServerInput {
    readonly cwd: string;
    readonly resumeThreadId: string | undefined;
    /** Cancels the handshake; the caller ends the process when the open fails. */
    readonly signal?: AbortSignal;
    /** The `thread/start` or `thread/resume` fields, given the app-server's `config/read`. */
    readonly threadParams: (configRead: unknown) => Record<string, unknown>;
    readonly transport: CodexTransport;
}

const CLIENT_INFO = { name: 'haus-computer', title: 'Haus Computer', version: '1' };

/**
 * initialize → initialized → `config/read` → `thread/start` or `thread/resume`. An archived
 * thread is unarchived and resumed once (Raft task #14); a missing rollout is a resume
 * rejection, and a busy writer a retryable startup failure.
 */
export async function openAppServer(input: OpenAppServerInput): Promise<CodexAppServer> {
    let listener: ((message: CodexInbound) => void) | null = null;
    let invalid: (line: string) => void = () => undefined;
    const connection = new CodexConnection(input.transport, answerCodexServerRequest, (line) =>
        invalid(line)
    );
    connection.listen((message) => listener?.(message));
    const { signal } = input;
    const initialized = initializeResultSchema.safeParse(
        await connection.request(
            'initialize',
            { capabilities: { experimentalApi: true }, clientInfo: CLIENT_INFO },
            { signal }
        )
    );
    if (!initialized.success) {
        throw new Error(
            'The Codex app-server answered initialize without a userAgent; it is not a compatible app-server build.'
        );
    }
    await connection.notify('initialized', {});
    const configRead = await connection.request(
        'config/read',
        { cwd: input.cwd, includeLayers: true },
        { signal }
    );
    const params = input.threadParams(configRead);
    const threadId = input.resumeThreadId
        ? await resumeThread(connection, input.resumeThreadId, params, signal)
        : threadIdOf(await connection.request('thread/start', params, { signal }));
    return {
        connection,
        resumed: input.resumeThreadId !== undefined,
        route(next, onInvalidLine) {
            listener = next;
            invalid = onInvalidLine;
        },
        threadId,
    };
}

async function resumeThread(
    connection: CodexConnection,
    threadId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined
): Promise<string> {
    const resume = { ...params, excludeTurns: true, threadId };
    try {
        return threadIdOf(await connection.request('thread/resume', resume, { signal }));
    } catch (error) {
        const reason = refusal(error);
        if (reason === 'archived') {
            await connection
                .request('thread/unarchive', { threadId }, { signal })
                .catch((cause: unknown) => {
                    // A cancelled or timed-out unarchive says nothing about the thread.
                    signal?.throwIfAborted();
                    throw new CodexResumeRejectedError(threadId, 'archived', { cause });
                });
            return threadIdOf(await connection.request('thread/resume', resume, { signal }));
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
