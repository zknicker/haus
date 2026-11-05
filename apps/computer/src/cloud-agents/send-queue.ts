import {
    type CloudAgentProvider as CloudAgentProviderId,
    isTerminalCloudAgentStatus,
} from '@haus/api';
import { Clock, Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { foreign } from './foreign-operation.ts';
import type { CloudLaunchJournal, CloudPendingSend as Pending } from './launch-journal.ts';
import type {
    CloudAgentProvider,
    CloudAgentProviderObservation,
    CloudAgentRunRef,
} from './provider.ts';
import { deliveryDue, followUpInterruptGraceMs, sendFailureOutcome } from './send-delivery.ts';

/**
 * Whether the provider will take a new prompt right now, when that differs
 * from whether the Run itself settled. A Claude Run reads `status: running`
 * for as long as it has an open background task, even once its foreground
 * turn ends and the session is `idle` and free for a follow-up — an open task
 * that outlives the turn can hold `running` forever, with no Cursor-style
 * Run expiry to unstick it (TECH-7). Cursor never reports `rawStatus: 'idle'`,
 * so its own unbounded wait is unchanged.
 */
function acceptsFollowUp(
    ref: CloudAgentRunRef,
    observation: CloudAgentProviderObservation
): boolean {
    return ref.provider === 'claude' && observation.rawStatus === 'idle';
}

function errorMessageOf(error: { cause: unknown }): string {
    const message = error.cause instanceof Error ? error.cause.message : String(error.cause);
    return message.trim() || 'unknown error';
}

/** Serializes short queue transitions; waiting for a remote turn never holds the permit. */
export class CloudAgentSendQueue {
    private readonly permit;

    constructor(
        runtime: DaemonRuntime,
        private readonly journal: CloudLaunchJournal,
        private readonly serverId: string,
        private readonly provider: (id: CloudAgentProviderId) => CloudAgentProvider
    ) {
        this.permit = runtime.runSync(Effect.makeSemaphore(1));
    }

    advance(ref: CloudAgentRunRef, cancelled: () => boolean) {
        const self = this;
        return this.permit.withPermits(1)(
            Effect.gen(function* () {
                const record = yield* foreign(() => self.journal.read(self.serverId, ref));
                if (record?.phase !== 'pending') {
                    return record;
                }
                const stop = cancelled();
                if (!(stop || deliveryDue(record, yield* Clock.currentTimeMillis))) {
                    return record;
                }
                if (!(yield* self.predecessorsReady(record, stop))) {
                    return record;
                }
                if (cancelled()) {
                    yield* foreign(() => self.journal.cancel(self.serverId, ref));
                } else {
                    yield* self.deliver(ref, record);
                }
                return yield* foreign(() => self.journal.read(self.serverId, ref));
            })
        );
    }

    /**
     * One send attempt under the Run's own id as idempotency key, so a retry
     * after a lost response never starts a second provider Run. A definite
     * refusal settles the prompt as rejected; a retryable failure keeps
     * retrying, falling back to an auto-interrupt once `followUpInterruptGraceMs`
     * has passed without one already attempted (TECH-7's design refinement:
     * a busy provider never fails the follow-up on its own).
     */
    private deliver(ref: CloudAgentRunRef, pending: Pending) {
        const self = this;
        return Effect.gen(function* () {
            const sent = yield* self.attemptSend(ref, pending);
            if (sent._tag === 'Right') {
                // A prior tick may already have interrupted the session for this
                // follow-up without yet delivering it; this delivery is still
                // owed to that interrupt, however many plain retries sit between.
                yield* foreign(() =>
                    self.journal.record(self.serverId, ref, sent.right, {
                        autoInterrupted: Boolean(pending.delivery?.interruptedAt),
                    })
                );
                return;
            }
            const outcome = sendFailureOutcome(
                pending,
                sent.left.cause,
                yield* Clock.currentTimeMillis
            );
            if (outcome.kind === 'reject') {
                yield* foreign(() => self.journal.reject(self.serverId, ref, outcome.rejection));
                return;
            }
            const now = yield* Clock.currentTimeMillis;
            const dueForInterrupt =
                !pending.delivery?.interruptedAt &&
                now - Date.parse(outcome.delivery.firstAttemptAt) >= followUpInterruptGraceMs;
            if (dueForInterrupt) {
                yield* self.interruptAndRetry(ref, pending, outcome.delivery);
                return;
            }
            yield* Effect.logWarning('Cloud Agent follow-up send will retry').pipe(
                Effect.annotateLogs({
                    attempts: outcome.delivery.attempts,
                    error: outcome.delivery.lastError,
                    operation: 'cloud-agent.send',
                    runId: ref.runId,
                })
            );
            yield* foreign(() => self.journal.defer(self.serverId, ref, pending, outcome.delivery));
        });
    }

    private attemptSend(ref: CloudAgentRunRef, pending: Pending) {
        return Effect.either(
            foreign(() =>
                this.provider(ref.provider).send({
                    idempotencyKey: ref.runId,
                    instructions: pending.instructions,
                    model: pending.model,
                    providerAgentId: pending.providerAgentId,
                    workId: ref.workId,
                })
            )
        );
    }

    /**
     * The fallback the delivery grace period earns: ask the provider to clear
     * whatever holds the session busy (`send --interrupt`'s own mechanism),
     * then retry the send once, right away. Delivery after this is flagged so
     * the card and `inspect` show it happened; failure at either step is one
     * flagged retryable failure, never a terminal one — the coordinator still
     * decides whether to stop, interrupt deliberately, or relaunch.
     */
    private interruptAndRetry(
        ref: CloudAgentRunRef,
        pending: Pending,
        delivery: NonNullable<Pending['delivery']>
    ) {
        const self = this;
        return Effect.gen(function* () {
            const interrupted = yield* Effect.either(
                foreign((signal) => self.provider(ref.provider).cancel(ref, signal))
            );
            const retried =
                interrupted._tag === 'Right' ? yield* self.attemptSend(ref, pending) : interrupted;
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
                'Cloud Agent auto-interrupt did not deliver the follow-up; still retrying'
            ).pipe(
                Effect.annotateLogs({
                    attempts: delivery.attempts,
                    error: errorMessageOf(retried.left),
                    operation: 'cloud-agent.send',
                    runId: ref.runId,
                })
            );
            yield* foreign(() =>
                self.journal.defer(self.serverId, ref, pending, {
                    ...delivery,
                    interruptedAt: new Date(now).toISOString(),
                })
            );
        });
    }

    private predecessorsReady(pending: Pending, stop: boolean) {
        const self = this;
        return Effect.gen(function* () {
            for (const previous of pending.predecessors) {
                if (!(yield* self.previousReady(previous, stop || pending.interrupt))) {
                    return false;
                }
            }
            return true;
        });
    }

    private previousReady(previous: CloudAgentRunRef, stop: boolean) {
        const self = this;
        return Effect.gen(function* () {
            const record = yield* foreign(() => self.journal.read(self.serverId, previous));
            if (record?.phase === 'cancelled' || record?.phase === 'rejected') {
                return true;
            }
            if (record?.phase === 'pending') {
                if (stop) {
                    yield* foreign(() => self.journal.cancel(self.serverId, previous));
                }
                return stop;
            }
            const launched = record?.phase === 'launched';
            const ref = launched ? { ...previous, ...record.launch } : previous;
            // A launched record is addressed even before its provider names the execution.
            if (!(ref.providerAgentId && (launched || ref.providerRunId))) {
                return yield* self.unaddressedReady(previous, record === null && stop);
            }
            const provider = self.provider(ref.provider);
            const observation = yield* foreign((signal) => provider.read(ref, signal));
            if (
                isTerminalCloudAgentStatus(observation.status) ||
                acceptsFollowUp(ref, observation)
            ) {
                return true;
            }
            if (stop) {
                yield* foreign((signal) => provider.cancel(ref, signal));
            }
            return false;
        });
    }

    /**
     * A predecessor without a provider address is not ready. One with no record
     * never reached the provider; its own monitor settles it after a grace
     * window. Stopping claims it cancelled now, and a late writer for it then
     * loses the exclusive claim.
     */
    private unaddressedReady(previous: CloudAgentRunRef, claimUnrecorded: boolean) {
        return claimUnrecorded
            ? foreign(() =>
                  this.journal.claim(this.serverId, previous, {
                      phase: 'cancelled',
                      workId: previous.workId,
                  })
              )
            : Effect.succeed(false);
    }
}
