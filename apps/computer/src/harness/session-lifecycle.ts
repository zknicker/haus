import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeSession } from '../runtime/driver.ts';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';

type Session = Pick<RuntimeSession, 'detach' | 'stop'>;
const owners = new WeakMap<DaemonRuntime, HarnessSessionOwner>();

export function harnessSessionOwner(runtime: DaemonRuntime): HarnessSessionOwner {
    let owner = owners.get(runtime);
    if (!owner) {
        owner = new HarnessSessionOwner();
        owners.set(runtime, owner);
    }
    return owner;
}

/** Owns live handles and parked sessions until the attachment daemon exits. */
export class HarnessSessionOwner {
    private readonly sessions = new Map<string, HarnessSessionLease>();
    /** Live throwaway heartbeat sessions; they never replace or park the Agent's main lease. */
    private readonly throwaways = new Set<HarnessSessionLease>();
    private closing: Promise<void> | null = null;
    private stopping = false;

    begin(agentRoot: string): HarnessSessionLease {
        if (this.stopping) {
            throw new Error('The Computer is shutting down.');
        }
        const lease = new HarnessSessionLease(agentRoot);
        this.sessions.set(agentRoot, lease);
        return lease;
    }

    /**
     * A lease for a throwaway heartbeat session. It is tracked apart from the Agent's
     * main lease, so the main session's parked state is never replaced, and it leaves
     * the set when its turn finishes.
     */
    beginThrowaway(agentRoot: string): HarnessSessionLease {
        if (this.stopping) {
            throw new Error('The Computer is shutting down.');
        }
        const lease = new HarnessSessionLease(agentRoot);
        this.throwaways.add(lease);
        void lease.whenFinished().then(() => this.throwaways.delete(lease));
        return lease;
    }

    beginShutdown(): void {
        this.stopping = true;
        for (const session of [...this.sessions.values(), ...this.throwaways]) {
            session.stopping = true;
        }
    }

    /** Waits out an Agent's running turn before resetting or retiring its workspace. */
    async stopAgent(agentRoot: string): Promise<void> {
        for (const lease of this.throwaways) {
            if (lease.root === agentRoot) {
                lease.stopping = true;
            }
        }
        const session = this.sessions.get(agentRoot);
        if (!session) {
            return;
        }
        session.stopping = true;
        await session.stop();
        if (this.sessions.get(agentRoot) === session) {
            this.sessions.delete(agentRoot);
        }
    }

    close(signal?: AbortSignal): Promise<void> {
        this.beginShutdown();
        this.closing ??= (async () => {
            const results = await Promise.allSettled(
                [...this.sessions.values(), ...this.throwaways].map((session) =>
                    session.stop(signal)
                )
            );
            const errors = results.flatMap((result) =>
                result.status === 'rejected' ? [result.reason] : []
            );
            if (errors.length > 0) {
                throw new AggregateError(errors, 'Harness sessions did not stop cleanly.');
            }
        })();
        return this.closing;
    }
}

export class HarnessSessionLease {
    private live: Session | null = null;
    private transition: Promise<RuntimeResumeState> | null = null;
    private readonly settled = Promise.withResolvers<void>();
    stopping = false;

    constructor(private readonly agentRoot: string) {}

    get root(): string {
        return this.agentRoot;
    }

    whenFinished(): Promise<void> {
        return this.settled.promise;
    }

    attach(live: Session): void {
        this.live = live;
    }

    async checkpoint(): Promise<RuntimeResumeState> {
        if (!this.live) {
            throw new Error('No Harness session is attached.');
        }
        if (!this.transition) {
            this.transition = this.stopping ? this.live.stop() : this.live.detach();
        }
        return await this.transition;
    }

    discard(): void {
        this.live = null;
    }

    /** Called only after the turn has finished all session-state writes. */
    finish(): void {
        this.settled.resolve();
    }

    async stop(signal?: AbortSignal): Promise<void> {
        this.stopping = true;
        await this.settled.promise;
        signal?.throwIfAborted();
        // A driver parks and stops to the same state; a warm process ends through the Computer's
        // warm pool (Agent reset or removal, shutdown), never by resuming the session here.
        if (this.transition) {
            await this.transition;
        }
    }
}
