import type { AgentCommand, AgentExecutionOutlines, AgentExecutionOutlinesResult } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

interface PendingOutlines {
    agentId: string;
    computerId: string;
    deferred: Deferred.Deferred<AgentExecutionOutlines>;
    requestId: string;
    runIds: readonly string[];
    serverId: string;
}

interface ExecutionOutlineRepliesOptions {
    /** Whether the Computer is online and attached for this Server. */
    isAttached(computerId: string, serverId: string): boolean;
    runtime: EffectRuntime<never>;
    send(computerId: string, frame: AgentCommand): boolean;
    timeoutMs?: number;
}

/**
 * Correlates batched execution-outline requests with the Computer's answers.
 * Like the execution journal, an outline request never fails: an offline,
 * vanished, or silent Computer settles every requested run as unavailable.
 */
export class ExecutionOutlineReplies {
    private readonly pending = new Map<string, PendingOutlines>();

    constructor(private readonly options: ExecutionOutlineRepliesOptions) {}

    request(
        computerId: string,
        input: { agentId: string; runIds: readonly string[]; serverId: string }
    ): Promise<AgentExecutionOutlines> {
        const reply: PendingOutlines = {
            ...input,
            computerId,
            deferred: this.options.runtime.runSync(Deferred.make<AgentExecutionOutlines>()),
            requestId: createOpaqueId('req'),
        };
        if (!this.options.isAttached(computerId, input.serverId)) {
            return Promise.resolve(unavailableOutlines(input.runIds, 'offline'));
        }
        this.pending.set(reply.requestId, reply);
        this.send(reply);
        return settle(
            this.options.runtime,
            Effect.raceFirst(
                Deferred.await(reply.deferred),
                Effect.sleep(this.options.timeoutMs ?? 10_000).pipe(
                    Effect.as(unavailableOutlines(reply.runIds, 'timeout'))
                )
            ).pipe(Effect.ensuring(Effect.sync(() => this.take(reply))))
        );
    }

    /** Accepts only the attached Server's answer naming exactly the requested runs, in order. */
    accept(computerId: string, result: AgentExecutionOutlinesResult): boolean {
        const reply = this.pending.get(result.requestId);
        if (
            !reply ||
            reply.computerId !== computerId ||
            reply.agentId !== result.agentId ||
            !this.options.isAttached(computerId, reply.serverId) ||
            result.outlines.length !== reply.runIds.length ||
            result.outlines.some((entry, index) => entry.runId !== reply.runIds[index])
        ) {
            return false;
        }
        return this.settle(reply, { outlines: result.outlines });
    }

    disconnect(computerId: string): void {
        for (const reply of this.pending.values()) {
            if (reply.computerId === computerId) {
                this.settle(reply, unavailableOutlines(reply.runIds, 'offline'));
            }
        }
    }

    private send(reply: PendingOutlines): void {
        try {
            if (
                this.options.send(reply.computerId, {
                    agentId: reply.agentId,
                    requestId: reply.requestId,
                    runIds: [...reply.runIds],
                    type: 'agent-execution-outlines-request',
                })
            ) {
                return;
            }
        } catch {}
        this.settle(reply, unavailableOutlines(reply.runIds, 'offline'));
    }

    private settle(reply: PendingOutlines, value: AgentExecutionOutlines): boolean {
        if (!this.take(reply)) {
            return false;
        }
        this.options.runtime.runSync(Deferred.succeed(reply.deferred, value));
        return true;
    }

    private take(reply: PendingOutlines): boolean {
        if (this.pending.get(reply.requestId) !== reply) {
            return false;
        }
        this.pending.delete(reply.requestId);
        return true;
    }
}

/** Every requested run, unavailable for one reason. */
export function unavailableOutlines(
    runIds: readonly string[],
    reason: 'offline' | 'timeout'
): AgentExecutionOutlines {
    return { outlines: runIds.map((runId) => ({ reason, runId, status: 'unavailable' })) };
}
