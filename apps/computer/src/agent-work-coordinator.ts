import { settle } from '@haus/effect';
import { Deferred } from 'effect';
import { type DaemonRuntime, daemonSerialWork } from './daemon-runtime.ts';

interface ActiveRun {
    agentId: string;
    controller: AbortController;
    settled: Deferred.Deferred<void>;
}

export type AgentRunReservation =
    | { controller: AbortController; kind: 'reserved' }
    /** `stopping` settles when the active run, already told to stop, releases. */
    | { kind: 'busy'; stopping?: Promise<void> }
    | { kind: 'duplicate' };

/** Owns per-Agent mutation ordering and live-run admission for one attachment daemon. */
export class AgentWorkCoordinator {
    private readonly configurations;
    private readonly runsByAgent = new Map<string, string>();
    private readonly runsById = new Map<string, ActiveRun>();

    constructor(private readonly runtime: DaemonRuntime) {
        this.configurations = daemonSerialWork(runtime);
    }

    abortAgent(agentId: string): void {
        const runId = this.runsByAgent.get(agentId);
        if (runId) {
            this.abortRun(runId);
        }
    }

    abortAll(): void {
        for (const run of this.runsById.values()) {
            run.controller.abort();
        }
    }

    abortRun(runId: string): void {
        this.runsById.get(runId)?.controller.abort();
    }

    activeRunId(agentId: string): string | undefined {
        return this.runsByAgent.get(agentId);
    }

    enqueueConfiguration(
        agentId: string,
        operation: (signal: AbortSignal) => Promise<void>
    ): Promise<void> {
        return this.configurations.run(agentId, operation);
    }

    release(agentId: string, runId: string): void {
        const active = this.runsById.get(runId);
        if (!(active && active.agentId === agentId)) {
            return;
        }
        this.runsById.delete(runId);
        if (this.runsByAgent.get(agentId) === runId) {
            this.runsByAgent.delete(agentId);
        }
        this.runtime.runSync(Deferred.succeed(active.settled, undefined));
    }

    reserve(agentId: string, runId: string): AgentRunReservation {
        if (this.runsById.has(runId)) {
            return { kind: 'duplicate' };
        }
        const activeRunId = this.runsByAgent.get(agentId);
        if (activeRunId) {
            const active = this.runsById.get(activeRunId);
            // A run told to stop is on its way out: the caller waits for it to
            // settle and starts again instead of losing the new start.
            if (active?.controller.signal.aborted) {
                return { kind: 'busy', stopping: settle(this.runtime, active.settled) };
            }
            return { kind: 'busy' };
        }
        const controller = new AbortController();
        const settled = this.runtime.runSync(Deferred.make<void>());
        this.runsById.set(runId, { agentId, controller, settled });
        this.runsByAgent.set(agentId, runId);
        return { controller, kind: 'reserved' };
    }

    waitForConfiguration(agentId: string): Promise<void> {
        return this.configurations.wait(agentId);
    }

    waitForRun(agentId: string): Promise<void> {
        const runId = this.runsByAgent.get(agentId);
        const active = runId ? this.runsById.get(runId) : undefined;
        return active ? settle(this.runtime, active.settled) : Promise.resolve();
    }
}
