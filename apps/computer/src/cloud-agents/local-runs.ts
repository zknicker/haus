import { Clock, Effect } from 'effect';
import { type CloudAgentOperationError, foreign } from './foreign-operation.ts';
import type { CloudLaunchJournal, CloudLaunchRecord } from './launch-journal.ts';
import type {
    CloudAgentLaunch,
    CloudAgentProviderObservation,
    CloudAgentRunRef,
} from './provider.ts';
import { launchRecordGraceMs, launchRecordMissing } from './send-delivery.ts';
import type { CloudAgentSendQueue } from './send-queue.ts';

/** A monitored Run the provider has not addressed yet. */
export interface LocalRun {
    readonly cancelRequested: boolean;
    readonly ref: CloudAgentRunRef;
    /** When resolution first found no journal record for this Run. */
    unrecordedSince?: number;
}

export type LocalRunState =
    | { kind: 'launched'; launch: CloudAgentLaunch; observedAt: string }
    /** Not at the provider; report the observation when one is given. */
    | { kind: 'unsent'; observation: CloudAgentProviderObservation | null };

/**
 * Resolves a Run without a provider address from this Computer's journal:
 * advances its queued send, recovers an acknowledged launch, or reports the
 * outcome the journal settled — refused, cancelled, or never recorded.
 */
export class CloudAgentLocalRuns {
    constructor(
        private readonly journal: CloudLaunchJournal,
        private readonly serverId: string,
        private readonly sends: CloudAgentSendQueue
    ) {}

    resolve(run: LocalRun): Effect.Effect<LocalRunState, CloudAgentOperationError> {
        const self = this;
        return Effect.gen(function* () {
            const recorded = yield* self.sends.advance(run.ref, () => run.cancelRequested);
            const nowMs = yield* Clock.currentTimeMillis;
            const observedAt = new Date(nowMs).toISOString();
            switch (recorded?.phase) {
                case 'pending':
                    return unsent(null);
                case 'launched':
                    return { kind: 'launched', launch: recorded.launch, observedAt } as const;
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
                    return unsent(
                        queued(
                            observedAt,
                            'Launch confirmation unavailable; inspect provider before retrying.'
                        )
                    );
                case undefined:
                    return yield* self.settleUnrecorded(run, nowMs);
            }
        });
    }

    /**
     * A Run Server recorded but this Computer never journaled — the sender
     * timed out or crashed between the two — never reached the provider. It
     * settles failed after a grace window that covers an in-flight sender, or
     * cancelled at once when stopped. The exclusive claim makes a late sender
     * lose, so the settled outcome is durable across restarts.
     */
    private settleUnrecorded(
        run: LocalRun,
        nowMs: number
    ): Effect.Effect<LocalRunState, CloudAgentOperationError> {
        const self = this;
        return Effect.gen(function* () {
            run.unrecordedSince ??= nowMs;
            const settled: CloudLaunchRecord | null = run.cancelRequested
                ? { phase: 'cancelled', workId: run.ref.workId }
                : nowMs - run.unrecordedSince >= launchRecordGraceMs
                  ? { phase: 'rejected', workId: run.ref.workId, ...launchRecordMissing }
                  : null;
            if (!settled) {
                return unsent(
                    queued(
                        new Date(nowMs).toISOString(),
                        'Waiting for this Computer to record the prompt.'
                    )
                );
            }
            yield* foreign(() => self.journal.claim(self.serverId, run.ref, settled));
            // Claimed or not, the journal now holds a record; report what it says.
            return yield* self.resolve(run);
        });
    }
}

function unsent(observation: CloudAgentProviderObservation | null): LocalRunState {
    return { kind: 'unsent', observation };
}

function queued(observedAt: string, summary: string): CloudAgentProviderObservation {
    return { activity: { at: observedAt, summary }, observedAt, status: 'queued' };
}
