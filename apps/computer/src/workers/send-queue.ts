import {
    type CloudAgentProvider as CloudAgentProviderId,
    isTerminalWorkerTurnStatus,
} from '@haus/api';
import { Clock, Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { foreign } from './foreign-operation.ts';
import type { CloudAgentProvider, WorkerTurnRef } from './provider.ts';
import { deliveryDue, followUpInterruptGraceMs, sendFailureOutcome } from './send-delivery.ts';
import type { WorkerTurnJournal } from './turn-journal.ts';
import type { WorkerSendingTurn as Sending } from './turn-record.ts';

function errorMessageOf(error: { cause: unknown }): string {
    const message = error.cause instanceof Error ? error.cause.message : String(error.cause);
    return message.trim() || 'unknown error';
}

/** Serializes short delivery transitions; waiting for a remote turn never holds the permit. */
export class WorkerSendQueue {
    private readonly permit;

    constructor(
        runtime: DaemonRuntime,
        private readonly journal: WorkerTurnJournal,
        private readonly serverId: string,
        private readonly provider: (id: CloudAgentProviderId) => CloudAgentProvider
    ) {
        this.permit = runtime.runSync(Effect.makeSemaphore(1));
    }

    advance(ref: WorkerTurnRef, cancelled: () => boolean) {
        const self = this;
        return this.permit.withPermits(1)(
            Effect.gen(function* () {
                const record = yield* foreign(() => self.journal.read(self.serverId, ref));
                if (record?.phase !== 'sending') {
                    return record;
                }
                if (cancelled()) {
                    yield* foreign(() => self.journal.cancel(self.serverId, ref));
                } else if (
                    deliveryDue(record, yield* Clock.currentTimeMillis) &&
                    (yield* self.predecessorsReady(ref, record))
                ) {
                    yield* self.deliver(ref, record);
                }
                return yield* foreign(() => self.journal.read(self.serverId, ref));
            })
        );
    }

    /**
     * One send attempt under the turn's own id as idempotency key, so a retry
     * after a lost response never starts a second provider run. A definite
     * refusal settles the turn as rejected; a retryable failure keeps
     * retrying, falling back to one auto-interrupt once
     * `followUpInterruptGraceMs` has passed, because a busy provider never
     * fails the follow-up on its own.
     */
    private deliver(ref: WorkerTurnRef, sending: Sending) {
        const self = this;
        return Effect.gen(function* () {
            const sent = yield* self.attemptSend(ref, sending);
            if (sent._tag === 'Right') {
                // An earlier tick may have interrupted the session for this follow-up.
                yield* foreign(() =>
                    self.journal.record(self.serverId, ref, sent.right, {
                        autoInterrupted: Boolean(sending.delivery?.interruptedAt),
                    })
                );
                return;
            }
            const outcome = sendFailureOutcome(
                sending,
                sent.left.cause,
                yield* Clock.currentTimeMillis
            );
            if (outcome.kind === 'reject') {
                yield* foreign(() => self.journal.reject(self.serverId, ref, outcome.rejection));
                return;
            }
            const now = yield* Clock.currentTimeMillis;
            const dueForInterrupt =
                !sending.delivery?.interruptedAt &&
                now - Date.parse(outcome.delivery.firstAttemptAt) >= followUpInterruptGraceMs;
            if (dueForInterrupt) {
                yield* self.interruptAndRetry(ref, sending, outcome.delivery);
                return;
            }
            yield* Effect.logWarning('Worker follow-up send will retry').pipe(
                Effect.annotateLogs({
                    attempts: outcome.delivery.attempts,
                    error: outcome.delivery.lastError,
                    operation: 'worker.send',
                    turnId: ref.turnId,
                })
            );
            yield* foreign(() => self.journal.defer(self.serverId, ref, sending, outcome.delivery));
        });
    }

    private attemptSend(ref: WorkerTurnRef, sending: Sending) {
        return Effect.either(
            foreign(() =>
                this.provider(ref.provider).send({
                    idempotencyKey: ref.turnId,
                    instructions: sending.input,
                    model: sending.model,
                    providerAgentId: sending.providerAgentId,
                    workerId: ref.workerId,
                })
            )
        );
    }

    /**
     * Asks the provider to clear whatever holds the session busy, then retries
     * the send once. Failure at either step is one more retryable failure,
     * never a terminal one.
     */
    private interruptAndRetry(
        ref: WorkerTurnRef,
        sending: Sending,
        delivery: NonNullable<Sending['delivery']>
    ) {
        const self = this;
        return Effect.gen(function* () {
            const interrupted = yield* Effect.either(
                foreign((signal) => self.provider(ref.provider).cancel(ref, signal))
            );
            const retried =
                interrupted._tag === 'Right' ? yield* self.attemptSend(ref, sending) : interrupted;
            if (retried._tag === 'Right') {
                yield* foreign(() =>
                    self.journal.record(self.serverId, ref, retried.right, {
                        autoInterrupted: true,
                    })
                );
                return;
            }
            const now = yield* Clock.currentTimeMillis;
            yield* Effect.logWarning(
                'Worker auto-interrupt did not deliver the follow-up; still retrying'
            ).pipe(
                Effect.annotateLogs({
                    attempts: delivery.attempts,
                    error: errorMessageOf(retried.left),
                    operation: 'worker.send',
                    turnId: ref.turnId,
                })
            );
            yield* foreign(() =>
                self.journal.defer(self.serverId, ref, sending, {
                    ...delivery,
                    interruptedAt: new Date(now).toISOString(),
                })
            );
        });
    }

    private predecessorsReady(ref: WorkerTurnRef, sending: Sending) {
        const self = this;
        return Effect.gen(function* () {
            for (const turnId of sending.predecessorTurnIds) {
                const previous = { ...ref, providerRunId: null, turnId };
                if (!(yield* self.previousReady(previous))) {
                    return false;
                }
            }
            return true;
        });
    }

    /**
     * A turn this Computer never journaled settled on the Server, so it holds
     * nothing back. One it launched must settle at the provider first: a
     * working turn is never steered.
     */
    private previousReady(previous: WorkerTurnRef) {
        const self = this;
        return Effect.gen(function* () {
            const record = yield* foreign(() => self.journal.read(self.serverId, previous));
            if (!record || record.phase === 'cancelled' || record.phase === 'rejected') {
                return true;
            }
            if (record.phase !== 'launched') {
                return false;
            }
            const provider = self.provider(previous.provider);
            const observation = yield* foreign((signal) =>
                provider.read({ ...previous, ...record.launch }, signal)
            );
            return isTerminalWorkerTurnStatus(observation.status);
        });
    }
}
