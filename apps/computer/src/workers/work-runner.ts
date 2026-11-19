import {
    type WorkerStopCommand,
    type WorkerObservation,
    type CloudAgentProvider as CloudAgentProviderId,
    type WorkerReconcileEntry,
    isTerminalWorkerTurnStatus,
} from '@haus/api';
import { settle } from '@haus/effect';
import { Deferred, type Duration, Effect, Exit, Scope } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { type WorkerOperationError, foreign } from './foreign-operation.ts';
import { withPullRequestEvidence } from './github/observation-evidence.ts';
import { createPullRequestReader } from './github/pull-request-reader.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import { WorkerLaunchScope } from './launch-scope.ts';
import { autoInterruptNote, WorkerLocalRuns } from './local-runs.ts';
import { type EnrichObservation, ObservationReports } from './observation-reports.ts';
import {
    type CloudAgentProvider,
    type CloudAgentProviderObservation,
    type WorkerTurnRef,
    workerLaunchObservation,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import { WorkerSendQueue } from './send-queue.ts';

interface WatchedRun {
    /** The journal confirmed the provider accepted this Run's prompt. */
    addressed?: boolean;
    cancelRequested: boolean;
    readonly ready: Deferred.Deferred<void>;
    ref: WorkerTurnRef;
    terminal: boolean;
    /** When this monitor first found no journal record for an unaddressed Run. */
    unrecordedSince?: number;
    readonly wake: Deferred.Deferred<void>;
}

interface Connection {
    readonly runs: Map<string, WatchedRun>;
    readonly scope: Scope.CloseableScope;
    readonly sink: (observation: WorkerObservation) => void;
}

/** The attachment daemon owns local monitoring; closing it never cancels hosted work. */
export class WorkerSupervisor {
    private connection: Connection | null = null;
    private closed = false;
    private closePromise: Promise<void> | null = null;
    private detachPromise: Promise<void> = Promise.resolve();
    private readonly launches: WorkerLaunchScope;
    private readonly enrich: EnrichObservation;
    private readonly localRuns: WorkerLocalRuns;
    private readonly provider: (id: CloudAgentProviderId) => CloudAgentProvider;

    constructor(
        private readonly runtime: DaemonRuntime,
        options: {
            dataRoot: string;
            serverId: string;
            provider?: (id: CloudAgentProviderId) => CloudAgentProvider;
            enrich?: EnrichObservation;
        }
    ) {
        const journal = new CloudLaunchJournal(options.dataRoot);
        this.provider = options.provider ?? ((id) => cloudAgentProvider(id, options.dataRoot));
        const sends = new WorkerSendQueue(runtime, journal, options.serverId, this.provider);
        this.localRuns = new WorkerLocalRuns(journal, options.serverId, sends);
        this.launches = new WorkerLaunchScope(runtime);
        const reader = createPullRequestReader({ runtime });
        this.enrich =
            options.enrich ??
            ((observation, signal) => withPullRequestEvidence(observation, reader, signal));
    }

    attach(sink: Connection['sink']): void {
        if (this.closed || this.connection) {
            return;
        }
        this.connection = { runs: new Map(), scope: this.runtime.runSync(Scope.make()), sink };
    }

    detach(): Promise<void> {
        const connection = this.connection;
        this.connection = null;
        if (connection) {
            this.detachPromise = Promise.all([
                this.detachPromise,
                settle(this.runtime, Scope.close(connection.scope, Exit.succeed(undefined))),
            ]).then(() => undefined);
        }
        return this.detachPromise;
    }

    close(): Promise<void> {
        this.closed = true;
        this.closePromise ??= Promise.all([this.launches.close(), this.detach()]).then(
            () => undefined
        );
        return this.closePromise;
    }

    runLaunch<Value>(operation: () => Promise<Value>): Promise<Value> {
        return this.launches.run(operation);
    }

    report(ref: WorkerTurnRef, observation: CloudAgentProviderObservation): void {
        this.connection?.sink({ ...observation, turnId: ref.turnId, workerId: ref.workerId });
    }
    watch(ref: WorkerTurnRef): void {
        this.admit(ref, false);
    }

    async cancel(command: WorkerStopCommand): Promise<void> {
        const run = this.admit(command, true);
        if (run) {
            await settle(this.runtime, Deferred.await(run.ready));
        }
    }

    async reconcile(entries: WorkerReconcileEntry[]): Promise<void> {
        const runs = entries.map((entry) =>
            isTerminalWorkerTurnStatus(entry.status)
                ? undefined
                : this.admit(entry, entry.cancelRequested)
        );
        await Promise.all(
            runs.map((run) =>
                run ? settle(this.runtime, Deferred.await(run.ready)) : Promise.resolve()
            )
        );
    }

    private admit(ref: WorkerTurnRef, cancelRequested: boolean): WatchedRun | undefined {
        const connection = this.connection;
        if (!connection || this.closed) {
            return;
        }
        const current = connection.runs.get(ref.turnId);
        if (current) {
            if (cancelRequested) {
                current.cancelRequested = true;
                this.runtime.runSync(Deferred.succeed(current.wake, undefined));
            }
            return current;
        }
        const run: WatchedRun = {
            cancelRequested,
            ready: this.runtime.runSync(Deferred.make<void>()),
            ref,
            terminal: false,
            wake: this.runtime.runSync(Deferred.make<void>()),
        };
        connection.runs.set(ref.turnId, run);
        this.runtime.runSync(Effect.forkIn(this.monitor(connection, run), connection.scope));
        return run;
    }

    private monitor(connection: Connection, run: WatchedRun): Effect.Effect<void> {
        const self = this;
        return Effect.gen(function* () {
            const reports = new ObservationReports(self.runtime, self.enrich, (observation) =>
                self.observe(connection, run, observation)
            );
            yield* Effect.forkScoped(reports.consume());
            let streamAttempted = false;
            while (!run.terminal) {
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
                    // A rejected repeat stop must not block terminal reconciliation.
                    const observation = yield* foreign((signal) => provider.read(run.ref, signal));
                    self.learnRunId(run, observation);
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
                                        self.learnRunId(run, observation);
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
                if (run.terminal) {
                    break;
                }
                if (outcome._tag === 'Left') {
                    yield* Effect.logWarning('Worker monitoring will retry').pipe(
                        Effect.annotateLogs({
                            operation: 'worker.monitor',
                            turnId: run.ref.turnId,
                        })
                    );
                    yield* self.pause(run, '60 seconds', wasCancelling);
                } else if (!outcome.right) {
                    yield* self.pause(run, '5 seconds', wasCancelling);
                }
            }
        }).pipe(
            Effect.scoped,
            Effect.ensuring(Effect.sync(() => connection.runs.delete(run.ref.turnId))),
            Effect.ensuring(Deferred.succeed(run.ready, undefined)),
            Effect.asVoid
        );
    }

    /**
     * A provider that acknowledged the prompt before naming its execution
     * (Claude) names it in a later reading; the ref keeps it from then on.
     */
    private learnRunId(run: WatchedRun, observation: CloudAgentProviderObservation): void {
        if (!run.ref.providerRunId && observation.providerRunId) {
            run.ref = { ...run.ref, providerRunId: observation.providerRunId };
        }
    }

    private pause(run: WatchedRun, duration: Duration.DurationInput, wasCancelling: boolean) {
        return wasCancelling
            ? Effect.sleep(duration)
            : Effect.raceFirst(Effect.sleep(duration), Deferred.await(run.wake));
    }

    private resolveAddress(
        connection: Connection,
        run: WatchedRun
    ): Effect.Effect<boolean, WorkerOperationError> {
        const self = this;
        return Effect.gen(function* () {
            if (run.addressed || (run.ref.providerAgentId && run.ref.providerRunId)) {
                return true;
            }
            const state = yield* self.localRuns.resolve(run);
            if (state.kind === 'unsent') {
                if (state.observation) {
                    self.observe(connection, run, state.observation);
                }
                return false;
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
        connection: Connection,
        run: WatchedRun,
        observation: CloudAgentProviderObservation
    ): void {
        if (this.connection !== connection || run.terminal) {
            return;
        }
        connection.sink({
            ...observation,
            providerAgentId: run.ref.providerAgentId ?? undefined,
            providerRunId: run.ref.providerRunId ?? observation.providerRunId,
            turnId: run.ref.turnId,
            workerId: run.ref.workerId,
        });
        if (isTerminalWorkerTurnStatus(observation.status)) {
            run.terminal = true;
            this.runtime.runSync(Deferred.succeed(run.wake, undefined));
        }
    }
}
