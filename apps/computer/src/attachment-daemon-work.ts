import { join } from 'node:path';
import { settle } from '@haus/effect';
import { Data, Effect } from 'effect';
import { holdAgentLaunchHostForWake } from './agent-launch-host.ts';
import { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import {
    type BackgroundWorkReporter,
    createBackgroundWorkReporter,
} from './background-work-reporter.ts';
import type { CloudAgentWorkSupervisor } from './cloud-agents/work-runner.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { harnessSessionOwner } from './harness/session-lifecycle.ts';
import { stopRuntimeProcesses } from './runtime/process-registry.ts';
import { closeRuntimeContext } from './runtime/runtime-context.ts';

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

    /** Background work Agents' runtimes run between turns; absent without a partition (tests). */
    readonly backgroundWork?: BackgroundWorkReporter;

    private closePromise: Promise<void> | null = null;
    private closing = false;
    private sender: AttachmentFrameSender | null = null;
    private readonly writers = new Set<Promise<unknown>>();

    constructor(
        private readonly runtime: DaemonRuntime,
        readonly cloudAgents?: CloudAgentWorkSupervisor,
        partition?: { dataRoot: string; serverId: string }
    ) {
        this.agentWork = new AgentWorkCoordinator(runtime);
        if (partition) {
            this.backgroundWork = createBackgroundWorkReporter({
                agentsDir: join(partition.dataRoot, 'servers', partition.serverId, 'agents'),
                closing: () => this.closing,
                holdForWake: (agentId, ms) =>
                    holdAgentLaunchHostForWake(partition.serverId, agentId, ms),
                onError: reportBackgroundWorkError,
                send: (frame) => this.send(frame),
            });
        }
    }

    /**
     * On each connect: reports every Agent's running sub-agents (clearing counts a restart made
     * stale), then, once, asks a wake for background work the previous daemon took with it.
     */
    async syncBackgroundWork(): Promise<void> {
        const work = this.backgroundWork;
        await work
            ?.reportCounts()
            .then(() => work.recoverLostWork())
            .catch(reportBackgroundWorkError);
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
                const results = await settle(
                    this.runtime,
                    shutdownStage(
                        () =>
                            Promise.allSettled([
                                ...this.writerSnapshot(),
                                this.cloudAgents?.close(),
                            ]),
                        'Computer shutdown timed out while draining accepted work.'
                    ),
                    { mapFailure: (failure) => failure.cause }
                );
                const failures = results.flatMap((result) =>
                    result.status === 'rejected' ? [result.reason] : []
                );
                await settle(
                    this.runtime,
                    shutdownStage(async (signal) => {
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
                    }, 'Computer shutdown timed out before all session state was saved.'),
                    { mapFailure: (failure) => failure.cause }
                );
            } finally {
                try {
                    // Every warm runtime process ends, then the host-tool server they called.
                    await closeRuntimeContext(this.runtime);
                } finally {
                    try {
                        await stopRuntimeProcesses(this.runtime);
                    } finally {
                        this.sender = null;
                    }
                }
            }
        })();
        return this.closePromise;
    }
}

function reportBackgroundWorkError(error: unknown) {
    console.error(
        `Background work report failed: ${error instanceof Error ? error.message : error}`
    );
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
