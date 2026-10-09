import { isTerminalCloudAgentStatus } from '@haus/api';
import { Clock, Effect } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { foreign } from './foreign-operation.ts';
import type { CloudLaunchJournal, CloudPendingSend as Pending } from './launch-journal.ts';
import type { CloudAgentProvider, CloudAgentRunRef } from './provider.ts';
import { deliveryDue, sendFailureOutcome } from './send-delivery.ts';

/** Serializes short queue transitions; waiting for a remote turn never holds the permit. */
export class CloudAgentSendQueue {
    private readonly permit;

    constructor(
        runtime: DaemonRuntime,
        private readonly journal: CloudLaunchJournal,
        private readonly serverId: string,
        private readonly provider: () => CloudAgentProvider
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
     * refusal or an exhausted deadline settles the prompt as rejected.
     */
    private deliver(ref: CloudAgentRunRef, pending: Pending) {
        const self = this;
        return Effect.gen(function* () {
            const sent = yield* Effect.either(
                foreign(() =>
                    self.provider().send({
                        idempotencyKey: ref.runId,
                        instructions: pending.instructions,
                        model: pending.model,
                        providerAgentId: pending.providerAgentId,
                    })
                )
            );
            if (sent._tag === 'Right') {
                yield* foreign(() => self.journal.record(self.serverId, ref, sent.right));
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
            const ref = record?.phase === 'launched' ? { ...previous, ...record.launch } : previous;
            if (!(ref.providerAgentId && ref.providerRunId)) {
                return yield* self.unaddressedReady(previous, record === null && stop);
            }
            const observation = yield* foreign((signal) => self.provider().read(ref, signal));
            if (isTerminalCloudAgentStatus(observation.status)) {
                return true;
            }
            if (stop) {
                yield* foreign((signal) => self.provider().cancel(ref, signal));
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
