import { workerNotJournaledErrorCode } from '@haus/api';
import { Clock, Effect } from 'effect';
import { type WorkerOperationError, foreign } from './foreign-operation.ts';
import { abortWorkerLaunch } from './launch-attempt.ts';
import type { CloudAgentProviderObservation, WorkerLaunch, WorkerTurnRef } from './provider.ts';
import type { WorkerSendQueue } from './send-queue.ts';
import type { WorkerTurnJournal } from './turn-journal.ts';
import type { WorkerHeldFollowUp, WorkerSendingTurn } from './turn-record.ts';

/** A monitored turn the provider has not addressed yet. */
export interface LocalRun {
    readonly cancelRequested: boolean;
    /** This connection drained the turn's held follow-up, so the Server now holds it. */
    readonly drained?: boolean;
    readonly ref: WorkerTurnRef;
}

export type LocalRunState =
    | {
          kind: 'launched';
          launch: WorkerLaunch;
          observedAt: string;
          /** This follow-up only delivered after Haus auto-interrupted the session. */
          autoInterrupted: boolean;
      }
    /** Not at the provider; report the observation when one is given. */
    | { kind: 'unsent'; observation: CloudAgentProviderObservation | null }
    /** A follow-up from before Workers, waiting for the Server to take it. */
    | { kind: 'held'; followUp: WorkerHeldFollowUp }
    /** Its held follow-up was drained: the Server holds it and will start it again. */
    | { kind: 'absent' };

/**
 * Resolves a turn without a provider address from this Computer's journal:
 * advances its delivery, recovers an acknowledged launch, or reports the
 * outcome the journal settled.
 */
export class WorkerLocalRuns {
    constructor(
        private readonly journal: WorkerTurnJournal,
        private readonly serverId: string,
        private readonly sends: WorkerSendQueue
    ) {}

    resolve(run: LocalRun): Effect.Effect<LocalRunState, WorkerOperationError> {
        const self = this;
        return Effect.gen(function* () {
            const recorded = yield* self.sends.advance(run.ref, () => run.cancelRequested);
            const nowMs = yield* Clock.currentTimeMillis;
            const observedAt = new Date(nowMs).toISOString();
            switch (recorded?.phase) {
                case 'sending': {
                    const { delivery } = recorded;
                    return unsent(
                        delivery?.interruptedAt
                            ? autoInterruptFailedQueued(observedAt, delivery)
                            : queued(observedAt, sendingActivity(recorded))
                    );
                }
                case 'pending':
                    if (run.cancelRequested) {
                        yield* foreign(() => self.journal.cancel(self.serverId, run.ref));
                        return yield* self.resolve(run);
                    }
                    return { followUp: recorded, kind: 'held' } as const;
                case 'launched':
                    return {
                        autoInterrupted: recorded.autoInterrupted,
                        kind: 'launched',
                        launch: recorded.launch,
                        observedAt,
                    } as const;
                case 'cancelled':
                    return unsent({ observedAt, status: 'cancelled' });
                case 'rejected':
                    return unsent({
                        errorCode: recorded.errorCode,
                        observedAt,
                        status: 'failed',
                        ...(recorded.summary ? { summary: recorded.summary } : {}),
                    });
                case 'launching':
                    if (
                        run.cancelRequested ||
                        !recorded.deadlineAt ||
                        nowMs >= Date.parse(recorded.deadlineAt)
                    ) {
                        if (run.cancelRequested) {
                            yield* foreign(() => self.journal.cancel(self.serverId, run.ref));
                        } else {
                            yield* foreign(() =>
                                self.journal.reject(self.serverId, run.ref, {
                                    errorCode: 'launch-timeout',
                                    summary: 'The Worker did not start before its launch deadline.',
                                })
                            );
                        }
                        abortWorkerLaunch(run.ref.turnId);
                        return yield* self.resolve(run);
                    }
                    return unsent(queued(observedAt, 'Starting the Worker.'));
                case undefined:
                    return yield* self.settleUnaccepted(run);
            }
        });
    }

    /**
     * A turn the Server names that this Computer never journaled never reached
     * the provider. A stop claims it cancelled; otherwise it is claimed
     * rejected `launch-refused`. Either claim is exclusive, so a start the
     * Server sends later loses it. Only a drained follow-up stays the Server's.
     */
    private settleUnaccepted(run: LocalRun): Effect.Effect<LocalRunState, WorkerOperationError> {
        if (run.drained && !run.cancelRequested) {
            return Effect.succeed({ kind: 'absent' });
        }
        const self = this;
        return Effect.gen(function* () {
            yield* foreign(() =>
                self.journal.claim(
                    self.serverId,
                    run.ref,
                    run.cancelRequested
                        ? { phase: 'cancelled', workerId: run.ref.workerId }
                        : {
                              errorCode: workerNotJournaledErrorCode,
                              phase: 'rejected',
                              summary:
                                  'This Computer never accepted the turn, so it never reached the provider.',
                              workerId: run.ref.workerId,
                          }
                )
            );
            return yield* self.resolve(run);
        });
    }
}

function unsent(observation: CloudAgentProviderObservation | null): LocalRunState {
    return { kind: 'unsent', observation };
}

/** Why an accepted follow-up has not reached the provider yet, for the card and `inspect`. */
function sendingActivity(sending: WorkerSendingTurn): string {
    if (sending.delivery) {
        return `The provider has not accepted this follow-up yet (attempt ${sending.delivery.attempts}; last error: ${sending.delivery.lastError}).`;
    }
    return sending.predecessorTurnIds.length > 0
        ? 'Waiting for the earlier turn to finish before sending this follow-up.'
        : 'Waiting for the provider to accept this follow-up.';
}

function queued(observedAt: string, summary: string): CloudAgentProviderObservation {
    return { activity: { at: observedAt, summary }, observedAt, status: 'queued' };
}

/**
 * Reported every tick once the auto-interrupt fallback was tried and the
 * follow-up still did not go through: still queued and retrying, with the
 * stall the Server raises one inbox item for.
 */
function autoInterruptFailedQueued(
    observedAt: string,
    delivery: NonNullable<WorkerSendingTurn['delivery']>
): CloudAgentProviderObservation {
    return {
        activity: {
            at: observedAt,
            summary: 'Auto-interrupt did not clear the session; still retrying.',
        },
        observedAt,
        stallCode: 'followup-auto-interrupt-failed',
        status: 'queued',
        summary: `Haus automatically interrupted the session to deliver this follow-up, but it still didn't go through. Last error: ${delivery.lastError}. Haus keeps retrying; stop the Worker or send with --interrupt if you want to act now.`,
    };
}

/** One-time: this turn's own monitor reports fresh activity from here on. */
export function autoInterruptNote(autoInterrupted: boolean): { summary?: string } {
    return autoInterrupted
        ? { summary: 'Haus automatically interrupted the session to deliver this follow-up.' }
        : {};
}
