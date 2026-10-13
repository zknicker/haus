import type {
    AgentCommand,
    ComputerSecretsOperation,
    ComputerSecretsResult,
    ComputerSecretsStatus,
} from '@haus/api';
import { type EffectRuntime, settle, tracePromise } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import { createOpaqueId } from '../postgres/opaque-id.ts';

interface PendingSecretsReply {
    computerId: string;
    deferred: Deferred.Deferred<ComputerSecretsStatus, Error>;
}

/**
 * Connect and refresh may install the pinned Varlock runtime on the Computer
 * (Computer's own install gives up at 110 s), so they wait longer than a
 * disconnect, which only deletes files.
 */
const replyTimeoutMs: Record<ComputerSecretsOperation['kind'], number> = {
    connect: 120_000,
    disconnect: 30_000,
    'refresh-items': 120_000,
};

/**
 * Correlates Computer Secrets requests with their results. A
 * `connect` operation carries a 1Password token: it lives only in this call's
 * frame and is never stored, traced, or logged here.
 */
export class SecretsReplyOffice {
    private readonly pending = new Map<string, PendingSecretsReply>();

    constructor(
        private readonly options: {
            runtime: EffectRuntime<never>;
            send(computerId: string, frame: AgentCommand): boolean;
            timeoutMs?: number;
        }
    ) {}

    request(
        computerId: string,
        operation: ComputerSecretsOperation
    ): Promise<ComputerSecretsStatus> {
        const requestId = createOpaqueId('req');
        const reply: PendingSecretsReply = {
            computerId,
            deferred: this.options.runtime.runSync(Deferred.make<ComputerSecretsStatus, Error>()),
        };
        this.pending.set(requestId, reply);
        return tracePromise(
            this.options.runtime,
            'haus.computer_secrets.operation',
            {
                'haus.operation': `computer_secrets.${operation.kind}`,
                'haus.request.id': requestId,
            },
            (traceContext) => {
                const sent = this.trySend(computerId, {
                    operation,
                    requestId,
                    traceContext,
                    type: 'computer-secrets-request',
                });
                if (!sent) {
                    this.settle(requestId, new Error('The selected Computer is offline.'));
                }
                return settle(
                    this.options.runtime,
                    Effect.raceFirst(
                        Deferred.await(reply.deferred),
                        Effect.sleep(this.options.timeoutMs ?? replyTimeoutMs[operation.kind]).pipe(
                            Effect.andThen(
                                Effect.fail(
                                    new Error('The Computer did not answer the Secrets request.')
                                )
                            )
                        )
                    ).pipe(Effect.ensuring(Effect.sync(() => this.pending.delete(requestId))))
                );
            }
        );
    }

    accept(computerId: string, result: ComputerSecretsResult): boolean {
        const reply = this.pending.get(result.requestId);
        if (reply?.computerId !== computerId) {
            return false;
        }
        this.settle(
            result.requestId,
            result.result ?? new Error(result.error ?? 'The Secrets request failed.')
        );
        return true;
    }

    disconnect(computerId: string): void {
        for (const [requestId, reply] of this.pending) {
            if (reply.computerId === computerId) {
                this.settle(requestId, new Error('The selected Computer went offline.'));
            }
        }
    }

    private trySend(computerId: string, frame: AgentCommand): boolean {
        try {
            return this.options.send(computerId, frame);
        } catch {
            return false;
        }
    }

    private settle(requestId: string, outcome: ComputerSecretsStatus | Error): void {
        const reply = this.pending.get(requestId);
        if (!reply) {
            return;
        }
        this.pending.delete(requestId);
        this.options.runtime.runSync(
            outcome instanceof Error
                ? Deferred.fail(reply.deferred, outcome)
                : Deferred.succeed(reply.deferred, outcome)
        );
    }
}
