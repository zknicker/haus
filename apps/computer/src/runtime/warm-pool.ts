import type { IdleCompactable } from './idle-compaction.ts';
import {
    type IdleCompactionOptions,
    IdleCompactionScheduler,
} from './idle-compaction-scheduler.ts';

/**
 * A parked native runtime process (`claude`, `codex app-server`, `grok`) between turns. One whose
 * runtime can compact itself (Claude Code) also implements `IdleCompactable`.
 */
export interface WarmProcess extends Partial<IdleCompactable> {
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
    /**
     * Compacts parked sessions shortly before their prompt cache expires, while
     * `setIdleCompaction(true)` holds (specs/runtime-drivers.md "Idle compaction"). Absent: never.
     */
    idleCompaction?: IdleCompactionOptions;
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

/**
 * An hour, matching Claude Code's one-hour prompt cache: a turn inside it reuses both the warm
 * process and the cached prefix, and a cold resume after it pays the cache write anyway.
 */
export const DEFAULT_WARM_IDLE_MS = 60 * 60_000;

/** Long enough for a real research or build sub-agent; short enough that a hung one ends. */
export const DEFAULT_BACKGROUND_LIMIT_MS = 4 * 60 * 60_000;

interface Parked {
    /** When the idle timer closes the process (epoch ms). */
    readonly closesAt: number;
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
    private readonly compaction: IdleCompactionScheduler | null;

    constructor(private readonly options: WarmPoolOptions) {
        this.idleMs = options.idleMs ?? DEFAULT_WARM_IDLE_MS;
        this.backgroundLimitMs = options.backgroundLimitMs ?? DEFAULT_BACKGROUND_LIMIT_MS;
        this.compaction = options.idleCompaction
            ? new IdleCompactionScheduler(options.idleCompaction, {
                  identity: (key, process) => {
                      const entry = this.parked.get(key);
                      return entry?.process === process ? entry.identity : undefined;
                  },
              })
            : null;
    }

    get size(): number {
        return this.parked.size;
    }

    /** The Server's idle compaction setting: arms every parked session, or cancels them all. */
    setIdleCompaction(enabled: boolean): void {
        this.compaction?.setEnabled(
            enabled,
            [...this.parked].map(([key, entry]) => [key, entry.process, entry.closesAt] as const)
        );
    }

    /** Parks `process` for the Agent session `key`; a previous process under it is closed. */
    async park(key: string, identity: WarmIdentity, process: WarmProcess): Promise<void> {
        if (this.closed || !process.alive) {
            await process.close();
            return;
        }
        const previous = this.parked.get(key);
        const closesAt = Date.now() + this.idleMs;
        this.parked.set(key, { closesAt, identity, process, timer: this.idleTimer(key, process) });
        this.compaction?.arm(key, process, closesAt);
        void process.exited.then(() => this.forget(key, process));
        if (previous && previous.process !== process) {
            // Two live processes must never write one Agent's conversation.
            clearTimeout(previous.timer);
            await previous.process.close();
        }
    }

    /**
     * Takes the process parked for `key` when it still runs with `want`'s identity and is the
     * kind `is` accepts. Anything else parked there is closed, so the open starts clean. A turn
     * that arrives while the process compacts waits for the compaction, never interleaving.
     */
    async claim<Process extends WarmProcess>(
        key: string,
        want: WarmIdentity,
        is: (process: WarmProcess) => process is Process
    ): Promise<Process | undefined> {
        await this.compaction?.runningFor(key);
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
            this.compaction?.disarm(key);
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
        const compacting = this.compaction?.runningFor(key);
        if (compacting) {
            // Never cut a compaction: the idle close runs once it finished.
            void compacting.then(() => this.expire(key, process));
            return;
        }
        if (process.holdsBackgroundWork && !this.outlived(process)) {
            // Background work still runs: the idle window starts over once it ends.
            this.parked.set(key, {
                ...entry,
                closesAt: Date.now() + this.idleMs,
                timer: this.idleTimer(key, process),
            });
            return;
        }
        this.take(key);
        process.close().catch(this.options.onCloseError);
    }
}
