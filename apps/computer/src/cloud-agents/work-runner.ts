import type {
    CloudAgentCancelCommand,
    CloudAgentObservation,
    CloudAgentReconcileEntry,
} from '@haus/api';
import { isTerminalCloudAgentStatus } from '@haus/api';
import { settle } from '@haus/effect';
import { Deferred, type Duration, Effect, Exit, Scope } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { type CloudAgentOperationError, foreign } from './foreign-operation.ts';
import { withPullRequestEvidence } from './github/observation-evidence.ts';
import { createPullRequestReader } from './github/pull-request-reader.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import { CloudAgentLaunchScope } from './launch-scope.ts';
import { CloudAgentLocalRuns } from './local-runs.ts';
import { type EnrichObservation, ObservationReports } from './observation-reports.ts';
import type {
    CloudAgentProvider,
    CloudAgentProviderObservation,
    CloudAgentRunRef,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import { CloudAgentSendQueue } from './send-queue.ts';

interface WatchedRun {
    cancelRequested: boolean;
    readonly ready: Deferred.Deferred<void>;
    ref: CloudAgentRunRef;
    terminal: boolean;
    /** When this monitor first found no journal record for an unaddressed Run. */
    unrecordedSince?: number;
    readonly wake: Deferred.Deferred<void>;
}

interface Connection {
    readonly runs: Map<string, WatchedRun>;
    readonly scope: Scope.CloseableScope;
    readonly sink: (observation: CloudAgentObservation) => void;
}

/** The attachment daemon owns local monitoring; closing it never cancels hosted work. */
export class CloudAgentWorkSupervisor {
    private connection: Connection | null = null;
    private closed = false;
    private closePromise: Promise<void> | null = null;
    private detachPromise: Promise<void> = Promise.resolve();
    private readonly launches: CloudAgentLaunchScope;
    private readonly enrich: EnrichObservation;
    private readonly localRuns: CloudAgentLocalRuns;
    private readonly provider: () => CloudAgentProvider;

    constructor(
        private readonly runtime: DaemonRuntime,
        options: {
            dataRoot: string;
            serverId: string;
            provider?: () => CloudAgentProvider;
            enrich?: EnrichObservation;
        }
    ) {
        const journal = new CloudLaunchJournal(options.dataRoot);
        this.provider = options.provider ?? cloudAgentProvider;
        const sends = new CloudAgentSendQueue(runtime, journal, options.serverId, this.provider);
        this.localRuns = new CloudAgentLocalRuns(journal, options.serverId, sends);
        this.launches = new CloudAgentLaunchScope(runtime);
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

    report(ref: CloudAgentRunRef, observation: CloudAgentProviderObservation): void {
        this.connection?.sink({ ...observation, runId: ref.runId, workId: ref.workId });
    }

    watch(ref: CloudAgentRunRef): void {
        this.admit(ref, false);
    }

    async cancel(command: CloudAgentCancelCommand): Promise<void> {
        const run = this.admit(command, true);
        if (run) {
            await settle(this.runtime, Deferred.await(run.ready));
        }
    }

    async reconcile(entries: CloudAgentReconcileEntry[]): Promise<void> {
        const runs = entries.map((entry) =>
            isTerminalCloudAgentStatus(entry.status)
                ? undefined
                : this.admit(entry, entry.cancelRequested)
        );
        await Promise.all(
            runs.map((run) =>
                run ? settle(this.runtime, Deferred.await(run.ready)) : Promise.resolve()
            )
        );
    }

    private admit(ref: CloudAgentRunRef, cancelRequested: boolean): WatchedRun | undefined {
        const connection = this.connection;
        if (!connection || this.closed) {
            return;
        }
        const current = connection.runs.get(ref.runId);
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
        connection.runs.set(ref.runId, run);
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
                    const provider = self.provider();
                    if (run.cancelRequested) {
                        yield* foreign((signal) => provider.cancel(run.ref, signal));
                    }
                    yield* reports.publish(
                        yield* foreign((signal) => provider.read(run.ref, signal))
                    );
                    yield* Deferred.succeed(run.ready, undefined);
                    if (!(run.terminal || run.cancelRequested || streamAttempted)) {
                        streamAttempted = true;
                        yield* Effect.raceFirst(
                            foreign((signal) =>
                                provider.subscribe(
                                    run.ref,
                                    (observation) => reports.enqueue(observation),
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
                    yield* Effect.logWarning('Cloud Agent monitoring will retry').pipe(
                        Effect.annotateLogs({
                            operation: 'cloud-agent.monitor',
                            runId: run.ref.runId,
                        })
                    );
                    yield* self.pause(run, '60 seconds', wasCancelling);
                } else if (!outcome.right) {
                    yield* self.pause(run, '5 seconds', wasCancelling);
                }
            }
        }).pipe(
            Effect.scoped,
            Effect.ensuring(Effect.sync(() => connection.runs.delete(run.ref.runId))),
            Effect.ensuring(Deferred.succeed(run.ready, undefined)),
            Effect.asVoid
        );
    }

    private pause(run: WatchedRun, duration: Duration.DurationInput, wasCancelling: boolean) {
        return wasCancelling
            ? Effect.sleep(duration)
            : Effect.raceFirst(Effect.sleep(duration), Deferred.await(run.wake));
    }

    private resolveAddress(
        connection: Connection,
        run: WatchedRun
    ): Effect.Effect<boolean, CloudAgentOperationError> {
        const self = this;
        return Effect.gen(function* () {
            if (run.ref.providerAgentId && run.ref.providerRunId) {
                return true;
            }
            const state = yield* self.localRuns.resolve(run);
            if (state.kind === 'unsent') {
                if (state.observation) {
                    self.observe(connection, run, state.observation);
                }
                return false;
            }
            run.ref = {
                ...run.ref,
                providerAgentId: state.launch.providerAgentId,
                providerRunId: state.launch.providerRunId,
            };
            self.observe(connection, run, {
                ...state.launch,
                providerUrl: state.launch.providerUrl ?? undefined,
                observedAt: state.observedAt,
            });
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
            providerRunId: run.ref.providerRunId ?? undefined,
            runId: run.ref.runId,
            workId: run.ref.workId,
        });
        if (isTerminalCloudAgentStatus(observation.status)) {
            run.terminal = true;
            this.runtime.runSync(Deferred.succeed(run.wake, undefined));
        }
    }
}
