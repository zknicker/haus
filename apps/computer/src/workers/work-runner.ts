import {
    type CloudAgentProvider as CloudAgentProviderId,
    isTerminalWorkerTurnStatus,
    type WorkerReconcileEntry,
    type WorkerStopCommand,
    type WorkerTurnStartFrame,
    isCloudWorkerPlace,
} from '@haus/api';
import { settle } from '@haus/effect';
import { Deferred, Effect, Exit, Scope } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { ComputerWorkerPlace } from './computer/computer-place.ts';
import type { WorkerServer } from './computer/credentials.ts';
import { withPullRequestEvidence } from './github/observation-evidence.ts';
import { createPullRequestReader } from './github/pull-request-reader.ts';
import { WorkerLaunchScope } from './launch-scope.ts';
import { WorkerLocalRuns } from './local-runs.ts';
import type { EnrichObservation } from './observation-reports.ts';
import type {
    CloudAgentProvider,
    CloudAgentProviderObservation,
    WorkerTurnRef,
} from './provider.ts';
import { cloudAgentProvider } from './registry.ts';
import { WorkerSendQueue } from './send-queue.ts';
import { WorkerTurnJournal } from './turn-journal.ts';
import { type WatchedRun, type WorkerConnection, WorkerTurnMonitor } from './turn-monitor.ts';
import { acceptWorkerTurn } from './turn-start.ts';

/** The attachment daemon owns local monitoring; closing it never cancels hosted work. */
export class WorkerSupervisor {
    private connection: WorkerConnection | null = null;
    private closed = false;
    private closePromise: Promise<void> | null = null;
    private detachPromise: Promise<void> = Promise.resolve();
    private readonly launches: WorkerLaunchScope;
    private readonly journal: WorkerTurnJournal;
    private readonly monitor: WorkerTurnMonitor;
    private readonly provider: (id: CloudAgentProviderId) => CloudAgentProvider;
    private readonly serverId: string;
    private readonly computer: ComputerWorkerPlace;

    constructor(
        private readonly runtime: DaemonRuntime,
        options: {
            server: WorkerServer;
            dataRoot: string;
            serverId: string;
            provider?: (id: CloudAgentProviderId) => CloudAgentProvider;
            enrich?: EnrichObservation;
        }
    ) {
        this.journal = new WorkerTurnJournal(options.dataRoot);
        this.serverId = options.serverId;
        this.provider = options.provider ?? ((id) => cloudAgentProvider(id, options.dataRoot));
        const sends = new WorkerSendQueue(runtime, this.journal, options.serverId, this.provider);
        const localRuns = new WorkerLocalRuns(this.journal, options.serverId, sends);
        this.launches = new WorkerLaunchScope(runtime);
        const reader = createPullRequestReader({ runtime });
        this.computer = new ComputerWorkerPlace({
            dataRoot: options.dataRoot,
            reader,
            server: options.server,
            serverId: options.serverId,
        });
        const enrich: EnrichObservation =
            options.enrich ??
            ((observation, signal) => withPullRequestEvidence(observation, reader, signal));
        this.monitor = new WorkerTurnMonitor(
            runtime,
            enrich,
            localRuns,
            this.provider,
            (connection) => this.connection === connection
        );
    }

    attach(send: WorkerConnection['send']): void {
        if (this.closed || this.connection) {
            return;
        }
        this.connection = { runs: new Map(), scope: this.runtime.runSync(Scope.make()), send };
        this.computer.attach(send);
        void this.launches.run(() => this.computer.connected());
    }

    detach(): Promise<void> {
        const connection = this.connection;
        this.connection = null;
        this.computer.detach();
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
        this.closePromise ??= Promise.all([
            this.computer.shutdown(),
            this.launches.close(),
            this.detach(),
        ]).then(() => undefined);
        return this.closePromise;
    }

    /** Journals one turn the Server started, acknowledges it, then runs it at most once. */
    accept(frame: WorkerTurnStartFrame): Promise<void> {
        if (!isCloudWorkerPlace(frame.place)) {
            return this.computer.accept(frame);
        }
        return acceptWorkerTurn(frame, frame.place.kind, {
            acknowledge: ({ attempt, turnId }) =>
                this.connection?.send({ attempt, turnId, type: 'worker-turn-accepted' }),
            journal: this.journal,
            provider: this.provider,
            report: (ref, observation) => this.report(ref, observation),
            runLaunch: (operation) => this.launches.run(operation),
            serverId: this.serverId,
            watch: (ref) => this.watch(ref),
        });
    }

    report(ref: WorkerTurnRef, observation: CloudAgentProviderObservation): void {
        this.connection?.send({
            observation: { ...observation, turnId: ref.turnId, workerId: ref.workerId },
            type: 'worker-observation',
        });
    }

    watch(ref: WorkerTurnRef): void {
        this.admit(ref, false);
    }

    async stop(command: WorkerStopCommand): Promise<void> {
        const ref = cloudTurnRefOf(command);
        if (!ref) {
            await this.computer.stop(command);
            return;
        }
        const run = this.admit(ref, true);
        if (run) {
            await settle(this.runtime, Deferred.await(run.ready));
        }
    }

    /** Closing step 5: the Computer place removes the closed Worker's worktree and drive folder. */
    closeWorker(workerId: string): Promise<void> {
        return this.computer.close(workerId);
    }

    async reconcile(entries: WorkerReconcileEntry[]): Promise<void> {
        const local = entries.filter((entry) => !isCloudWorkerPlace(entry.place));
        const runs = entries.map((entry) => {
            const ref = cloudTurnRefOf(entry);
            return ref && !isTerminalWorkerTurnStatus(entry.status)
                ? this.admit(ref, entry.stopRequested)
                : undefined;
        });
        await Promise.all([
            this.computer.reconcile(local),
            ...runs.map((run) =>
                run ? settle(this.runtime, Deferred.await(run.ready)) : Promise.resolve()
            ),
        ]);
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
        this.runtime.runSync(Effect.forkIn(this.monitor.watch(connection, run), connection.scope));
        return run;
    }
}

/** The wire names the place; provider adapters address the same turn by provider. */
function cloudTurnRefOf(entry: WorkerStopCommand | WorkerReconcileEntry): WorkerTurnRef | null {
    if (!isCloudWorkerPlace(entry.place)) {
        return null;
    }
    return {
        provider: entry.place.kind,
        providerAgentId: entry.providerAgentId,
        providerRunId: entry.providerRunId,
        turnId: entry.turnId,
        workerId: entry.workerId,
    };
}
