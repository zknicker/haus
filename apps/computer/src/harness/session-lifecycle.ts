import type { HarnessAgentResumeSessionState, HarnessAgentSession } from '@ai-sdk/harness/agent';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { readAgentSessionState, writeAgentSessionState } from './session-store.ts';

type Session = Pick<HarnessAgentSession, 'detach' | 'stop'>;
type Resume = (state: HarnessAgentResumeSessionState, signal?: AbortSignal) => Promise<Session>;
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

    beginShutdown(): void {
        this.stopping = true;
        for (const session of this.sessions.values()) {
            session.stopping = true;
        }
    }

    close(signal?: AbortSignal): Promise<void> {
        this.beginShutdown();
        this.closing ??= (async () => {
            const results = await Promise.allSettled(
                [...this.sessions.values()].map((session) => session.stop(signal))
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
    private resume: Resume | null = null;
    private transition: Promise<HarnessAgentResumeSessionState> | null = null;
    private parked: HarnessAgentResumeSessionState | null = null;
    private readonly settled = Promise.withResolvers<void>();
    private stopped = false;
    stopping = false;

    constructor(private readonly agentRoot: string) {}

    prepare(resumeState: HarnessAgentResumeSessionState | undefined, resume: Resume): void {
        this.parked = resumeState ?? null;
        this.resume = resume;
    }

    attach(live: Session, resume: Resume): void {
        this.live = live;
        this.resume = resume;
    }

    async checkpoint(): Promise<HarnessAgentResumeSessionState> {
        if (!this.live) {
            throw new Error('No Harness session is attached.');
        }
        if (!this.transition) {
            this.stopped = this.stopping;
            this.transition = this.stopped ? this.live.stop() : this.live.detach();
        }
        this.parked = await this.transition;
        return this.parked;
    }

    discard(): void {
        this.live = null;
        this.parked = null;
    }

    /** Called only after the turn has finished all session-state writes. */
    finish(): void {
        this.settled.resolve();
    }

    async stop(signal?: AbortSignal): Promise<void> {
        this.stopping = true;
        await this.settled.promise;
        signal?.throwIfAborted();
        if (this.transition) {
            await this.transition;
        }
        if (!this.stopped && this.parked && this.resume) {
            const stored = await readAgentSessionState(this.agentRoot);
            // A reset or retirement can remove this parked session between turns.
            if (!(stored && JSON.stringify(stored.resumeState) === JSON.stringify(this.parked))) {
                return;
            }
            const resumed = await this.resume(this.parked, signal);
            const state = await resumed.stop();
            signal?.throwIfAborted();
            await writeAgentSessionState(this.agentRoot, { ...stored, resumeState: state });
            this.stopped = true;
        }
    }
}
