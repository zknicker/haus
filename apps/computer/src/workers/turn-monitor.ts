import {
    type CloudAgentProvider as CloudAgentProviderId,
    isTerminalWorkerTurnStatus,
    type WorkerFollowUpDrainFrame,
    type WorkerObservationFrame,
    type WorkerTurnAcceptedFrame,
} from '@haus/api';
import { Deferred, type Duration, Effect, type Scope } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { followUpDrainFrame } from './follow-up-drain.ts';
import { foreign } from './foreign-operation.ts';
import { autoInterruptNote, type WorkerLocalRuns } from './local-runs.ts';
import { type EnrichObservation, ObservationReports } from './observation-reports.ts';
import {
    type CloudAgentProvider,
    type CloudAgentProviderObservation,
    type WorkerTurnRef,
    workerLaunchObservation,
} from './provider.ts';

export type WorkerComputerFrame =
    | WorkerFollowUpDrainFrame
    | WorkerObservationFrame
    | WorkerTurnAcceptedFrame;

export interface WatchedRun {
    addressed?: boolean;
    cancelRequested: boolean;
    drained?: boolean;
    readonly ready: Deferred.Deferred<void>;
    ref: WorkerTurnRef;
    released?: boolean;
    terminal: boolean;
    readonly wake: Deferred.Deferred<void>;
}

export interface WorkerConnection {
    readonly runs: Map<string, WatchedRun>;
    readonly scope: Scope.CloseableScope;
    readonly send: (frame: WorkerComputerFrame) => void;
}

export class WorkerTurnMonitor {
    constructor(
        private readonly runtime: DaemonRuntime,
        private readonly enrich: EnrichObservation,
        private readonly localRuns: WorkerLocalRuns,
        private readonly provider: (id: CloudAgentProviderId) => CloudAgentProvider,
        private readonly isLive: (connection: WorkerConnection) => boolean
    ) {}

    watch(connection: WorkerConnection, run: WatchedRun) {
        const self = this;
        return Effect.gen(function* () {
            const reports = new ObservationReports(self.runtime, self.enrich, (observation) =>
                self.observe(connection, run, observation)
            );
            yield* Effect.forkScoped(reports.consume());
            let streamAttempted = false;
            while (!(run.terminal || run.released)) {
                const attempt = Effect.gen(function* () {
                    if (!(yield* self.resolveAddress(connection, run))) {
                        return false;
                    }
                    const provider = self.provider(run.ref.provider);
                    const cancellation = run.cancelRequested
                        ? yield* Effect.either(
                              foreign((signal) => provider.cancel(run.ref, signal))
                          )
                        : undefined;
                    const observation = yield* foreign((signal) => provider.read(run.ref, signal));
                    learnRunId(run, observation);
                    yield* reports.publish(observation);
                    if (!run.terminal && cancellation?._tag === 'Left') {
                        return yield* Effect.fail(cancellation.left);
                    }
                    yield* Deferred.succeed(run.ready, undefined);
                    if (!(run.terminal || run.cancelRequested || streamAttempted)) {
                        streamAttempted = true;
                        yield* Effect.raceFirst(
                            foreign((signal) =>
                                provider.subscribe(
                                    run.ref,
                                    (observation) => {
                                        learnRunId(run, observation);
                                        reports.enqueue(observation);
                                    },
                                    signal
                                )
                            ),
                            Deferred.await(run.wake)
                        );
                        return true;
                    }
                    return false;
                });
                const wasCancelling = run.cancelRequested;
                const outcome = yield* Effect.either(attempt);
                yield* Deferred.succeed(run.ready, undefined);
                if (run.terminal || run.released) {
                    break;
                }
                if (outcome._tag === 'Left') {
                    yield* Effect.logWarning('Worker monitoring will retry').pipe(
                        Effect.annotateLogs({ operation: 'worker.monitor', turnId: run.ref.turnId })
                    );
                    yield* pause(run, '60 seconds', wasCancelling);
                } else if (!outcome.right) {
                    yield* pause(run, '5 seconds', wasCancelling);
                }
            }
        }).pipe(
            Effect.scoped,
            Effect.ensuring(Effect.sync(() => connection.runs.delete(run.ref.turnId))),
            Effect.ensuring(Deferred.succeed(run.ready, undefined)),
            Effect.asVoid
        );
    }

    private resolveAddress(connection: WorkerConnection, run: WatchedRun) {
        const self = this;
        return Effect.gen(function* () {
            if (run.addressed || (run.ref.providerAgentId && run.ref.providerRunId)) {
                return true;
            }
            const state = yield* self.localRuns.resolve(run);
            switch (state.kind) {
                case 'absent':
                    run.released = true;
                    return false;
                case 'held':
                    if (!run.drained && self.isLive(connection)) {
                        run.drained = true;
                        connection.send(followUpDrainFrame(run.ref, state.followUp));
                    }
                    return false;
                case 'unsent':
                    if (state.observation) {
                        self.observe(connection, run, state.observation);
                    }
                    return false;
                case 'launched':
                    break;
            }
            run.addressed = true;
            run.ref = {
                ...run.ref,
                providerAgentId: state.launch.providerAgentId,
                providerRunId: run.ref.providerRunId ?? state.launch.providerRunId,
            };
            const extra = autoInterruptNote(state.autoInterrupted);
            self.observe(
                connection,
                run,
                workerLaunchObservation(state.launch, state.observedAt, extra)
            );
            return !run.terminal;
        });
    }

    private observe(
        connection: WorkerConnection,
        run: WatchedRun,
        observation: CloudAgentProviderObservation
    ) {
        if (!this.isLive(connection) || run.terminal) {
            return;
        }
        connection.send({
            observation: {
                ...observation,
                providerAgentId: run.ref.providerAgentId ?? undefined,
                providerRunId: run.ref.providerRunId ?? observation.providerRunId,
                turnId: run.ref.turnId,
                workerId: run.ref.workerId,
            },
            type: 'worker-observation',
        });
        if (isTerminalWorkerTurnStatus(observation.status)) {
            run.terminal = true;
            this.runtime.runSync(Deferred.succeed(run.wake, undefined));
        }
    }
}

function learnRunId(run: WatchedRun, observation: CloudAgentProviderObservation) {
    if (!run.ref.providerRunId && observation.providerRunId) {
        run.ref = { ...run.ref, providerRunId: observation.providerRunId };
    }
}

function pause(run: WatchedRun, duration: Duration.DurationInput, wasCancelling: boolean) {
    return wasCancelling
        ? Effect.sleep(duration)
        : Effect.raceFirst(Effect.sleep(duration), Deferred.await(run.wake));
}
