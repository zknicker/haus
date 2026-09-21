import type {
    AgentCommand,
    CloudAgentCapabilityRequest,
    CloudAgentCapabilityResult,
} from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

type CapabilityReplyValue = NonNullable<CloudAgentCapabilityResult['result']>;
type CapabilityRequest = Pick<CloudAgentCapabilityRequest, 'operation' | 'provider'>;

interface PendingCapabilityReply {
    computerId: string;
    deferred: Deferred.Deferred<CapabilityReplyValue, Error>;
    requestId: string;
}

interface CloudAgentCapabilityReplyOfficeOptions {
    runtime: EffectRuntime<never>;
    send(computerId: string, frame: AgentCommand): boolean;
}

export class CloudAgentCapabilityReplyOffice {
    private readonly pending = new Map<string, PendingCapabilityReply>();

    constructor(private readonly options: CloudAgentCapabilityReplyOfficeOptions) {}

    request(computerId: string, input: CapabilityRequest): Promise<CapabilityReplyValue> {
        const reply: PendingCapabilityReply = {
            computerId,
            deferred: this.options.runtime.runSync(Deferred.make()),
            requestId: createOpaqueId('req'),
        };
        this.pending.set(reply.requestId, reply);
        this.sendOrFail(reply, {
            ...input,
            requestId: reply.requestId,
            type: 'cloud-agent-capability-request',
        });
        const timeoutMs = 10_000;
        return settle(
            this.options.runtime,
            Effect.raceFirst(
                Deferred.await(reply.deferred),
                Effect.sleep(timeoutMs).pipe(
                    Effect.andThen(
                        Effect.fail(
                            new Error('The Computer did not answer the Cloud Agent request.')
                        )
                    )
                )
            ).pipe(Effect.ensuring(Effect.sync(() => this.take(reply))))
        );
    }

    accept(computerId: string, result: CloudAgentCapabilityResult): boolean {
        const reply = this.pending.get(result.requestId);
        if (!reply || reply.computerId !== computerId || !this.take(reply)) {
            return false;
        }
        this.options.runtime.runSync(
            result.result
                ? Deferred.succeed(reply.deferred, result.result)
                : Deferred.fail(
                      reply.deferred,
                      new Error(result.error ?? 'The Cloud Agent request failed.')
                  )
        );
        return true;
    }

    disconnect(computerId: string): void {
        for (const reply of this.pending.values()) {
            if (reply.computerId === computerId) {
                this.reject(reply, new Error('The selected Computer went offline.'));
            }
        }
    }

    private sendOrFail(reply: PendingCapabilityReply, frame: AgentCommand): void {
        try {
            if (!this.options.send(reply.computerId, frame)) {
                this.reject(reply, new Error('The selected Computer is offline.'));
            }
        } catch (cause) {
            this.reject(reply, cause instanceof Error ? cause : new Error(String(cause)));
        }
    }

    private reject(reply: PendingCapabilityReply, error: Error): void {
        if (this.take(reply)) {
            this.options.runtime.runSync(Deferred.fail(reply.deferred, error));
        }
    }

    private take(reply: PendingCapabilityReply): boolean {
        if (this.pending.get(reply.requestId) !== reply) {
            return false;
        }
        this.pending.delete(reply.requestId);
        return true;
    }
}
