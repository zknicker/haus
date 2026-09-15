import { spawn } from 'node:child_process';
import { encodeMessage, limits, readMessages, workerResponseSchema } from './protocol.ts';

export interface McpExecution {
    code: string;
    command: { executable: string; args: string[] };
    invoke(input: { path: string; args: unknown; signal: AbortSignal }): Promise<unknown>;
    signal?: AbortSignal;
}

/** A finite foreign-process adapter. The caller's turn owns its cancellation. */
export async function executeMcpCode(input: McpExecution): Promise<unknown> {
    input.signal?.throwIfAborted();
    if (Buffer.byteLength(input.code) > limits.codeBytes) {
        throw new Error('MCP execution exceeded its code size limit.');
    }
    const lifetime = new AbortController();
    const signal = AbortSignal.any([
        lifetime.signal,
        AbortSignal.timeout(limits.timeoutMs),
        ...(input.signal ? [input.signal] : []),
    ]);
    const child = spawn(input.command.executable, input.command.args, {
        cwd: '/',
        env: {},
        stdio: ['pipe', 'pipe', 'ignore'],
    });
    const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
    const failure = new Promise<never>((_resolve, reject) => {
        child.once('error', reject);
        child.stdin.on('error', reject);
    });
    const abort = () => {
        child.kill('SIGKILL');
    };
    signal.addEventListener('abort', abort, { once: true });
    const invocations = new Set<Promise<void>>();
    let calls = 0;
    const read = async () => {
        child.stdin.write(encodeMessage({ type: 'start', code: input.code }));
        for await (const raw of readMessages(child.stdout)) {
            signal.throwIfAborted();
            const message = workerResponseSchema.parse(raw);
            if (message.type === 'failed') {
                throw new Error(message.message);
            }
            if (message.type === 'done') {
                return message.result;
            }
            if (++calls > limits.calls) {
                throw new Error('MCP execution exceeded its tool call limit.');
            }
            const invocation = input
                .invoke({ path: message.path, args: message.args, signal })
                .then((value) => {
                    signal.throwIfAborted();
                    child.stdin.write(encodeMessage({ type: 'reply', id: message.id, value }));
                });
            invocations.add(invocation);
            // Failure ends the worker; the read loop then settles at EOF.
            void invocation.catch(abort).finally(() => invocations.delete(invocation));
        }
        signal.throwIfAborted();
        throw new Error('MCP execution stopped before returning a result.');
    };
    try {
        if (signal.aborted) {
            abort();
            signal.throwIfAborted();
        }
        return await Promise.race([read(), failure]);
    } finally {
        lifetime.abort();
        signal.removeEventListener('abort', abort);
        child.kill('SIGKILL');
        child.stdin.destroy();
        child.stdout.destroy();
        await exited;
        await Promise.allSettled(invocations);
    }
}
