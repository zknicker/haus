import * as Effect from 'effect/Effect';
import {
    encodeMessage,
    limits,
    readMessages,
    type WorkerResponse,
    workerRequestSchema,
} from './protocol.ts';
import { createExecutor } from './quickjs.ts';

/** Internal stdio entrypoint; it receives neither runner identity nor credentials. */
export async function runMcpExecutorWorker(): Promise<void> {
    const executor = await createExecutor();
    const pending = new Map<number, (value: unknown) => void>();
    let started = false;
    let nextId = 0;
    const emit = (message: WorkerResponse) => process.stdout.write(encodeMessage(message));
    const run = async (code: string) => {
        try {
            const result = await Effect.runPromise(
                executor.execute(code, {
                    invoke: ({ path, args }) =>
                        Effect.tryPromise(
                            () =>
                                new Promise<unknown>((resolve) => {
                                    const id = ++nextId;
                                    if (id > limits.calls) {
                                        throw new Error(
                                            'MCP execution exceeded its tool call limit.'
                                        );
                                    }
                                    pending.set(id, resolve);
                                    emit({ type: 'invoke', id, path, args });
                                })
                        ),
                })
            );
            emit({ type: 'done', result });
        } catch {
            emit({ type: 'failed', message: 'MCP execution failed or exceeded its limits.' });
        } finally {
            process.stdin.push(null);
        }
    };
    let execution: Promise<void> | undefined;
    for await (const raw of readMessages(process.stdin)) {
        const message = workerRequestSchema.parse(raw);
        if (message.type === 'start') {
            if (started) {
                throw new Error('MCP execution was already started.');
            }
            started = true;
            execution = run(message.code);
        } else {
            const resolve = pending.get(message.id);
            if (!resolve) {
                throw new Error('MCP execution received an unexpected reply.');
            }
            pending.delete(message.id);
            resolve(message.value);
        }
    }
    await execution;
}

if (import.meta.main) {
    await runMcpExecutorWorker();
}
