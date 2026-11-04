import {
    type IdleCompactable,
    type IdleCompactionResult,
    type IdleCompactionSkip,
    type IdleCompactionSnapshot,
    idleCompactionDueAt,
    idleCompactionVerdict,
} from './idle-compaction.ts';
import type { WarmIdentity, WarmProcess } from './warm-pool.ts';

/** Where the warm pool asks about and reports the idle compactions it runs. */
export interface IdleCompactionHooks {
    /**
     * Haus is about to use the session: a run holds or waits for the Agent, or it is being
     * reset or retired. A busy session is never compacted; Claude Code skips a pending prompt.
     */
    busy(key: string): boolean;
    /** Whether `key` is an Agent's main session; a throwaway (heartbeat) session never compacts. */
    compactable(key: string): boolean;
    /** A compaction failed; the process stays parked (or ended, when it hung or exited). */
    failed(key: string, error: unknown): void;
    /** Records a finished compaction: journal, Usage, telemetry. Must not throw. */
    report(key: string, identity: WarmIdentity, result: IdleCompactionResult): Promise<void>;
    /** An armed compaction did not run, and why. */
    skipped(key: string, reason: IdleCompactionSkip): void;
}

export interface IdleCompactionOptions {
    /** Test seam: when an armed compaction fires; Claude Code's 90% of the cache TTL otherwise. */
    dueAt?: (snapshot: IdleCompactionSnapshot) => number | null;
    hooks: IdleCompactionHooks;
    now?: () => number;
}

/** The pool's view of one parked entry, read when a timer fires. */
export interface ParkedLookup {
    identity(key: string, process: WarmProcess): WarmIdentity | undefined;
}

interface Armed {
    readonly process: WarmProcess & IdleCompactable;
    readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Arms one idle compaction per parked Agent session while the Server's setting is on, and runs
 * it on the parked process when it comes due (specs/runtime-drivers.md "Idle compaction"). The
 * pool waits for a running compaction before handing the process to a turn or closing it, so a
 * compaction and a turn never interleave on one conversation.
 */
export class IdleCompactionScheduler {
    private readonly armed = new Map<string, Armed>();
    private enabled = false;
    private readonly now: () => number;
    private readonly running = new Map<string, Promise<void>>();

    constructor(
        private readonly options: IdleCompactionOptions,
        private readonly parked: ParkedLookup
    ) {
        this.now = options.now ?? Date.now;
    }

    get isEnabled(): boolean {
        return this.enabled;
    }

    /** The Server setting changed: arm every parked session, or cancel every armed timer. */
    setEnabled(enabled: boolean, parked: Iterable<[string, WarmProcess, number]>): void {
        this.enabled = enabled;
        if (!enabled) {
            for (const key of [...this.armed.keys()]) {
                this.disarm(key);
            }
            return;
        }
        for (const [key, process, closesAt] of parked) {
            this.arm(key, process, closesAt);
        }
    }

    /**
     * Arms the compaction for a session just parked. Nothing is armed while the setting is off,
     * for a runtime that cannot compact, before its first request, when its last request did not
     * write the one-hour cache, or when the pool would close the process first.
     */
    arm(key: string, process: WarmProcess, closesAt: number): void {
        this.disarm(key);
        if (!(this.enabled && isCompactable(process) && this.options.hooks.compactable(key))) {
            return;
        }
        const snapshot = process.idleCompactionSnapshot();
        const dueAt = snapshot ? (this.options.dueAt ?? idleCompactionDueAt)(snapshot) : null;
        if (!(snapshot && dueAt !== null) || dueAt >= closesAt) {
            return;
        }
        const timer = setTimeout(
            () => this.fire(key, process, snapshot, dueAt),
            Math.max(0, dueAt - this.now())
        );
        timer.unref?.();
        this.armed.set(key, { process, timer });
    }

    /** The session left the pool (claimed, evicted, closed): its timer goes with it. */
    disarm(key: string): void {
        const armed = this.armed.get(key);
        if (armed) {
            clearTimeout(armed.timer);
            this.armed.delete(key);
        }
    }

    /** The compaction running on `key`'s process, settled either way; undefined when none. */
    runningFor(key: string): Promise<void> | undefined {
        return this.running.get(key);
    }

    private fire(
        key: string,
        process: WarmProcess & IdleCompactable,
        armed: IdleCompactionSnapshot,
        dueAt: number
    ) {
        if (this.armed.get(key)?.process === process) {
            this.armed.delete(key);
        }
        const identity = this.parked.identity(key, process);
        if (!(this.enabled && identity && process.alive)) {
            return;
        }
        const { hooks } = this.options;
        const verdict = idleCompactionVerdict({
            armed,
            busy: process.holdsBackgroundWork === true || hooks.busy(key),
            current: process.idleCompactionSnapshot(),
            dueAt,
            now: this.now(),
        });
        if (verdict !== 'compact') {
            hooks.skipped(key, verdict);
            return;
        }
        const compaction = process.compact();
        // A turn waits only for the compaction itself, never for its recording.
        const run = compaction.then(
            () => undefined,
            () => undefined
        );
        this.running.set(key, run);
        void run.then(() => {
            if (this.running.get(key) === run) {
                this.running.delete(key);
            }
        });
        compaction
            .then(
                (result) => hooks.report(key, identity, result),
                (error: unknown) => hooks.failed(key, error)
            )
            .catch((error: unknown) => hooks.failed(key, error));
    }
}

function isCompactable(process: WarmProcess): process is WarmProcess & IdleCompactable {
    return (
        typeof (process as Partial<IdleCompactable>).compact === 'function' &&
        typeof (process as Partial<IdleCompactable>).idleCompactionSnapshot === 'function'
    );
}
