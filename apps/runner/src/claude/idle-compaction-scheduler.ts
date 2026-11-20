import type { InvocationClock } from '../invocations/invocation-clock.ts';
import {
    type IdleCompactable,
    type IdleCompactionResult,
    type IdleCompactionSkip,
    type IdleCompactionSnapshot,
    idleCompactionDueAt,
    idleCompactionVerdict,
} from './idle-compaction.ts';

export interface IdleCompactionHooks<Process> {
    busy(agentId: string): boolean;
    compacted(agentId: string, process: Process): Promise<void>;
    failed(agentId: string, error: unknown): void;
    report(agentId: string, process: Process, result: IdleCompactionResult): Promise<void>;
    skipped(agentId: string, reason: IdleCompactionSkip): void;
}

export interface IdleCompactionOptions<Process> {
    clock?: InvocationClock;
    dueAt?: (snapshot: IdleCompactionSnapshot) => number | null;
    hooks: IdleCompactionHooks<Process>;
    now?: () => number;
}

export interface ParkedLookup<Process> {
    isParked(agentId: string, process: Process): boolean;
}

interface Armed<Process> {
    readonly process: Process;
    readonly timer: { cancel(): void };
}

const unrefClock: InvocationClock = {
    schedule(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        timer.unref();
        return { cancel: () => clearTimeout(timer) };
    },
};

export type IdleCompactionGate = boolean | ((agentId: string) => boolean);

export class IdleCompactionScheduler<Process extends IdleCompactable> {
    private readonly armed = new Map<string, Armed<Process>>();
    private readonly clock: InvocationClock;
    private allows: (agentId: string) => boolean = () => false;
    private readonly now: () => number;
    private readonly running = new Map<string, Promise<void>>();

    constructor(
        private readonly options: IdleCompactionOptions<Process>,
        private readonly parked: ParkedLookup<Process>
    ) {
        this.clock = options.clock ?? unrefClock;
        this.now = options.now ?? Date.now;
    }

    setGate(gate: IdleCompactionGate, parked: Iterable<readonly [string, Process, number]>) {
        this.allows = typeof gate === 'boolean' ? () => gate : gate;
        for (const agentId of [...this.armed.keys()]) {
            if (!this.allows(agentId)) {
                this.disarm(agentId);
            }
        }
        for (const [agentId, process, closesAt] of parked) {
            if (this.allows(agentId) && !this.armed.has(agentId)) {
                this.arm(agentId, process, closesAt);
            }
        }
    }

    arm(agentId: string, process: Process, closesAt: number) {
        this.disarm(agentId);
        const compacting = this.running.get(agentId);
        if (compacting) {
            void compacting.then(() => {
                if (!this.running.has(agentId) && this.parked.isParked(agentId, process)) {
                    this.arm(agentId, process, closesAt);
                }
            });
            return;
        }
        if (!this.allows(agentId)) {
            return;
        }
        const snapshot = process.idleCompactionSnapshot();
        const dueAt = snapshot ? (this.options.dueAt ?? idleCompactionDueAt)(snapshot) : null;
        if (!(snapshot && dueAt !== null) || dueAt >= closesAt) {
            return;
        }
        const timer = this.clock.schedule(
            () => this.fire(agentId, process, snapshot, dueAt),
            Math.max(0, dueAt - this.now())
        );
        this.armed.set(agentId, { process, timer });
    }

    disarm(agentId: string) {
        const armed = this.armed.get(agentId);
        if (armed) {
            armed.timer.cancel();
            this.armed.delete(agentId);
        }
    }

    disarmProcess(process: Process) {
        for (const [agentId, armed] of this.armed) {
            if (armed.process === process) {
                this.disarm(agentId);
            }
        }
    }

    runningFor(agentId: string) {
        return this.running.get(agentId);
    }

    private fire(agentId: string, process: Process, armed: IdleCompactionSnapshot, dueAt: number) {
        if (this.armed.get(agentId)?.process === process) {
            this.armed.delete(agentId);
        }
        if (
            !(this.allows(agentId) && this.parked.isParked(agentId, process) && process.alive) ||
            this.running.has(agentId)
        ) {
            return;
        }
        const { hooks } = this.options;
        const verdict = idleCompactionVerdict({
            armed,
            busy: process.holdsBackgroundWork === true || hooks.busy(agentId),
            current: process.idleCompactionSnapshot(),
            dueAt,
            now: this.now(),
        });
        if (verdict !== 'compact') {
            hooks.skipped(agentId, verdict);
            return;
        }
        const compaction = process.compact();
        const run = compaction
            .then(
                () => hooks.compacted(agentId, process),
                () => undefined
            )
            .catch((error: unknown) => hooks.failed(agentId, error));
        this.running.set(agentId, run);
        void run.then(() => {
            if (this.running.get(agentId) === run) {
                this.running.delete(agentId);
            }
        });
        compaction
            .then(
                (result) => hooks.report(agentId, process, result),
                (error: unknown) => hooks.failed(agentId, error)
            )
            .catch((error: unknown) => hooks.failed(agentId, error));
    }
}
