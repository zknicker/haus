import { settle } from '@haus/effect';
import { Data, Effect } from 'effect';
import { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { stopSandboxProcesses } from './harness/sandbox-process-owner.ts';
import { harnessSessionOwner } from './harness/session-lifecycle.ts';

export interface AttachmentFrameSender {
    send(frame: unknown): boolean;
}

/** Owns Agent work and response routing for the full attachment-daemon lifetime. */
export class AttachmentDaemonWork {
    readonly agentWork: AgentWorkCoordinator;
    readonly noticeSinks = new Map<
        string,
        { deliver: (notice: string) => Promise<boolean>; runId: string }
    >();
    readonly resettingAgents = new Set<string>();
    readonly retiredAgents = new Set<string>();

    private closePromise: Promise<void> | null = null;
    private closing = false;
    private sender: AttachmentFrameSender | null = null;
    private readonly writers = new Set<Promise<unknown>>();

    constructor(
        private readonly runtime: DaemonRuntime,
        readonly cloudAgents?: CloudAgentWorkSupervisor
    ) {
        this.agentWork = new AgentWorkCoordinator(runtime);
    }

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
        const sessions = harnessSessionOwner(this.runtime);
        sessions.beginShutdown();
        this.agentWork.abortAll();
        this.closePromise = (async () => {
            try {
                await settle(
                    this.runtime,
                    Effect.tryPromise({
                        catch: (cause) => new AttachmentShutdownForeignError({ cause }),
                        try: async (signal) => {
                            const results = await Promise.allSettled([
                                ...this.writerSnapshot(),
                                this.cloudAgents?.close(),
                            ]);
                            const failures = results.flatMap((result) =>
                                result.status === 'rejected' ? [result.reason] : []
                            );
                            try {
                                await sessions.close(signal);
                            } catch (error) {
                                failures.push(error);
                            }
                            if (failures.length) {
                                throw new AggregateError(
                                    failures,
                                    'Computer work did not drain cleanly.'
                                );
                            }
                        },
                    }).pipe(
                        Effect.timeoutFail({
                            duration: '20 seconds',
                            onTimeout: () =>
                                new AttachmentShutdownForeignError({
                                    cause: new Error(
                                        'Computer shutdown timed out before all session state was saved.'
                                    ),
                                }),
                        })
                    ),
                    { mapFailure: (failure) => failure.cause }
                );
            } finally {
                try {
                    await stopSandboxProcesses(this.runtime);
                } finally {
                    this.sender = null;
                }
            }
        })();
        return this.closePromise;
    }
}

class AttachmentShutdownForeignError extends Data.TaggedError('AttachmentShutdownForeignError')<{
    readonly cause: unknown;
}> {}
