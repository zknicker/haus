/** A parked native runtime process (`claude`, `codex app-server`, `grok`) between turns. */
export interface WarmProcess {
    readonly alive: boolean;
    /** Ends the process for good; resolves once it exited. */
    close(): Promise<void>;
    /** Settles once the process exited on its own or was closed. */
    readonly exited: Promise<unknown>;
}

/** What a parked process was launched with; only an identical open may reuse it. */
export interface WarmIdentity {
    /** Every launch fact fixed at spawn (binary, env, instructions, model, effort, paths). */
    readonly launchKey: string;
    /** The native conversation the process holds open. */
    readonly nativeSessionId: string;
    readonly runtimeId: string;
}

export interface WarmPoolOptions {
    /** A process parked this long without a turn is closed; the next open resumes it cold. */
    idleMs?: number;
    /** Reports a close that failed off any turn's path (idle eviction). */
    onCloseError: (error: unknown) => void;
}

/** Where one Agent session parks its process: the shared pool and the session's key. */
export interface WarmSlot {
    /** The Agent's root: one Agent, one session, at most one warm process. */
    readonly key: string;
    readonly pool: WarmProcessPool;
}

export const DEFAULT_WARM_IDLE_MS = 30 * 60_000;

interface Parked {
    readonly identity: WarmIdentity;
    readonly process: WarmProcess;
    readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Computer-wide parked runtime processes, one per Agent session (keyed by the Agent's root):
 * a detached session parks its process here so the Agent's next turn continues it without a
 * spawn. A changed launch fingerprint, another runtime, or another conversation closes the
 * parked process instead. Idle processes close after `idleMs`; `close` ends every one.
 */
export class WarmProcessPool {
    private readonly parked = new Map<string, Parked>();
    private readonly idleMs: number;
    private closed = false;

    constructor(private readonly options: WarmPoolOptions) {
        this.idleMs = options.idleMs ?? DEFAULT_WARM_IDLE_MS;
    }

    get size(): number {
        return this.parked.size;
    }

    /** Parks `process` for the Agent session `key`; a previous process under it is closed. */
    async park(key: string, identity: WarmIdentity, process: WarmProcess): Promise<void> {
        if (this.closed || !process.alive) {
            await process.close();
            return;
        }
        const previous = this.parked.get(key);
        const timer = setTimeout(() => this.expire(key, process), this.idleMs);
        timer.unref?.();
        this.parked.set(key, { identity, process, timer });
        void process.exited.then(() => this.forget(key, process));
        if (previous && previous.process !== process) {
            // Two live processes must never write one Agent's conversation.
            clearTimeout(previous.timer);
            await previous.process.close();
        }
    }

    /**
     * Takes the process parked for `key` when it still runs with `want`'s identity and is the
     * kind `is` accepts. Anything else parked there is closed, so the open starts clean.
     */
    async claim<Process extends WarmProcess>(
        key: string,
        want: WarmIdentity,
        is: (process: WarmProcess) => process is Process
    ): Promise<Process | undefined> {
        const entry = this.take(key);
        if (!entry) {
            return;
        }
        const { identity, process } = entry;
        if (
            process.alive &&
            is(process) &&
            identity.runtimeId === want.runtimeId &&
            identity.launchKey === want.launchKey &&
            identity.nativeSessionId === want.nativeSessionId
        ) {
            return process;
        }
        await process.close();
    }

    /** Closes the process parked for `key` (Agent reset or removal). */
    async evict(key: string): Promise<void> {
        await this.take(key)?.process.close();
    }

    /** Closes every parked process; later parks close immediately (Computer shutdown). */
    async close(): Promise<void> {
        this.closed = true;
        const entries = [...this.parked.keys()].flatMap((key) => this.take(key) ?? []);
        const results = await Promise.allSettled(entries.map((entry) => entry.process.close()));
        const errors = results.flatMap((result) =>
            result.status === 'rejected' ? [result.reason] : []
        );
        if (errors.length > 0) {
            throw new AggregateError(errors, 'Warm runtime processes did not stop cleanly.');
        }
    }

    private take(key: string): Parked | undefined {
        const entry = this.parked.get(key);
        if (entry) {
            this.parked.delete(key);
            clearTimeout(entry.timer);
        }
        return entry;
    }

    private forget(key: string, process: WarmProcess) {
        if (this.parked.get(key)?.process === process) {
            this.take(key);
        }
    }

    private expire(key: string, process: WarmProcess) {
        if (this.parked.get(key)?.process !== process) {
            return;
        }
        this.take(key);
        process.close().catch(this.options.onCloseError);
    }
}
