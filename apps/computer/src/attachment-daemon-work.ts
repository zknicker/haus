import { settle } from '@haus/effect';
import { Data, Effect } from 'effect';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { WorkerSupervisor } from './workers/work-runner.ts';

export interface AttachmentFrameSender {
    send(frame: unknown): boolean;
}

/** Owns Worker work and response routing for the full attachment-daemon lifetime. */
export class AttachmentDaemonWork {
    readonly resettingAgents = new Set<string>();
    readonly retiredAgents = new Set<string>();

    private closePromise: Promise<void> | null = null;
    private closing = false;
    private sender: AttachmentFrameSender | null = null;
    private readonly writers = new Set<Promise<unknown>>();

    constructor(
        private readonly runtime: DaemonRuntime,
        readonly workers?: WorkerSupervisor
    ) {}

    attachSender(sender: AttachmentFrameSender): () => void {
        if (this.closing) {
            return () => undefined;
        }
        this.sender = sender;
        return () => {
            if (this.sender === sender) {
                this.sender = null;
            }
        };
    }

    send(frame: unknown): boolean {
        return this.sender?.send(frame) ?? false;
    }

    track<Result>(operation: Promise<Result>): Promise<Result> {
        if (this.closing) {
            return Promise.reject(new Error('The attachment daemon is shutting down.'));
        }
        this.writers.add(operation);
        operation.then(
            () => this.writers.delete(operation),
            () => this.writers.delete(operation)
        );
        return operation;
    }

    writerSnapshot(): Promise<unknown>[] {
        return [...this.writers];
    }

    get isClosing(): boolean {
        return this.closing;
    }

    close(): Promise<void> {
        if (this.closePromise) {
            return this.closePromise;
        }
        this.closing = true;
        this.closePromise = (async () => {
            try {
                const results = await settle(
                    this.runtime,
                    shutdownStage(
                        () => Promise.allSettled([...this.writerSnapshot(), this.workers?.close()]),
                        'Computer shutdown timed out while draining accepted work.'
                    ),
                    { mapFailure: (failure) => failure.cause }
                );
                const failures = results.flatMap((result) =>
                    result.status === 'rejected' ? [result.reason] : []
                );
                if (failures.length) {
                    throw new AggregateError(failures, 'Computer work did not drain cleanly.');
                }
            } finally {
                this.sender = null;
            }
        })();
        return this.closePromise;
    }
}

function shutdownStage<Value>(
    operation: (signal: AbortSignal) => Promise<Value>,
    detail: string
): Effect.Effect<Value, AttachmentShutdownForeignError> {
    return Effect.tryPromise({
        catch: (cause) => new AttachmentShutdownForeignError({ cause }),
        try: operation,
    }).pipe(
        Effect.timeoutFail({
            duration: '20 seconds',
            onTimeout: () => new AttachmentShutdownForeignError({ cause: new Error(detail) }),
        })
    );
}

class AttachmentShutdownForeignError extends Data.TaggedError('AttachmentShutdownForeignError')<{
    readonly cause: unknown;
}> {}
