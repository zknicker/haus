/** A parked native runtime process (`claude`, `codex app-server`, `grok`) between turns. */
export interface WarmProcess {
    readonly alive: boolean;
    /** When its oldest live background task started (epoch ms); null when none runs. */
    readonly backgroundWorkSince?: number | null;
    /** Ends the process for good; resolves once it exited. */
    close(): Promise<void>;
    /** Settles once the process exited on its own or was closed. */
    readonly exited: Promise<unknown>;
    /**
     * Interrupts a turn the runtime started on its own while parked, sparing its background
     * tasks: the Server refused the wake that turn needed (specs/runtime-drivers.md).
     */
    fenceSelfStartedTurn?(): Promise<void>;
    /**
     * Work the process runs past its turn (a background sub-agent or shell, or a turn the
     * runtime started on its own to report one). Closing would end it, so the pool never
     * closes such a process for idleness or a launch-fact change; evict and close still do.
     */
    readonly holdsBackgroundWork?: boolean;
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
    /**
     * How long background work may keep a parked process past the idle window. Past it the
     * work is treated as hung: the process closes as an unplanned end, so the Agent is woken
     * to say the work stopped. Checked at each idle window, so it is honored within `idleMs`.
     */
    backgroundLimitMs?: number;
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

/** Long enough for a real research or build sub-agent; short enough that a hung one ends. */
export const DEFAULT_BACKGROUND_LIMIT_MS = 4 * 60 * 60_000;

interface Parked {
    readonly identity: WarmIdentity;
    readonly process: WarmProcess;
    readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Computer-wide parked runtime processes, one per Agent session (keyed by the Agent's root):
 * a detached session parks its process here so the Agent's next turn continues it without a
 * spawn. A changed launch fingerprint, another runtime, or another conversation closes the
 * parked process instead. Idle processes close after `idleMs`; `close` ends every one. A process
 * holding background work is exempt from both the idle close and the launch-fingerprint close
 * until that work ends (specs/runtime-drivers.md "Background work").
 */
export class WarmProcessPool {
    private readonly parked = new Map<string, Parked>();
    private readonly idleMs: number;
    private readonly backgroundLimitMs: number;
    private closed = false;

    constructor(private readonly options: WarmPoolOptions) {
        this.idleMs = options.idleMs ?? DEFAULT_WARM_IDLE_MS;
        this.backgroundLimitMs = options.backgroundLimitMs ?? DEFAULT_BACKGROUND_LIMIT_MS;
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
        this.parked.set(key, { identity, process, timer: this.idleTimer(key, process) });
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
        const sameConversation =
            identity.runtimeId === want.runtimeId &&
            identity.nativeSessionId === want.nativeSessionId;
        // New launch facts wait for the background work to end; the next claim relaunches.
        const keep = identity.launchKey === want.launchKey || process.holdsBackgroundWork === true;
        if (process.alive && is(process) && sameConversation && keep) {
            return process;
        }
        await process.close();
    }

    /** Interrupts the self-started turn of the process parked for `key`, if one is parked. */
    async fence(key: string): Promise<void> {
        await this.parked.get(key)?.process.fenceSelfStartedTurn?.();
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

    /**
     * A parked process that exited on its own still owes its cleanup: `close` ends the
     * descendants its process group left behind and revokes its host-tool scope.
     */
    private forget(key: string, process: WarmProcess) {
        if (this.parked.get(key)?.process === process) {
            this.take(key);
            process.close().catch(this.options.onCloseError);
        }
    }

    /** Its oldest background task ran past the lifetime bound: treat it as hung. */
    private outlived(process: WarmProcess): boolean {
        const since = process.backgroundWorkSince;
        return typeof since === 'number' && Date.now() - since >= this.backgroundLimitMs;
    }

    private idleTimer(key: string, process: WarmProcess): ReturnType<typeof setTimeout> {
        const timer = setTimeout(() => this.expire(key, process), this.idleMs);
        timer.unref?.();
        return timer;
    }

    private expire(key: string, process: WarmProcess) {
        const entry = this.parked.get(key);
        if (entry?.process !== process) {
            return;
        }
        if (process.holdsBackgroundWork && !this.outlived(process)) {
            // Background work still runs: the idle window starts over once it ends.
            this.parked.set(key, { ...entry, timer: this.idleTimer(key, process) });
            return;
        }
        this.take(key);
        process.close().catch(this.options.onCloseError);
    }
}
