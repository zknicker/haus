import { type WarmIdentity, WarmPool } from '../turn/warm-pool.ts';
import {
    type IdleCompactionGate,
    type IdleCompactionHooks,
    type IdleCompactionOptions,
    IdleCompactionScheduler,
} from './idle-compaction-scheduler.ts';
import type { IdleCompactable } from './idle-compaction.ts';

export class CompactingPool<Process extends IdleCompactable> {
    private readonly pool: WarmPool<Process>;
    private readonly scheduler: IdleCompactionScheduler<Process>;

    constructor(
        private readonly options: Omit<IdleCompactionOptions<Process>, 'hooks'> & {
            hooks: IdleCompactionHooks<Process>;
            idleMs: number;
            maxWarm: number;
        }
    ) {
        this.pool = new WarmPool<Process>({
            holds: (agentId) => this.scheduler.runningFor(agentId) !== undefined,
            idleMs: options.idleMs,
            maxWarm: options.maxWarm,
        });
        this.scheduler = new IdleCompactionScheduler<Process>(options, this.pool);
    }

    get size() {
        return this.pool.size;
    }

    setIdleCompaction(gate: IdleCompactionGate) {
        this.scheduler.setGate(gate, this.pool.closingTimes());
    }

    park(agentId: string, identity: WarmIdentity, process: Process, now: number) {
        const closing = this.pool.park(agentId, identity, process, now);
        this.scheduler.arm(agentId, process, now + this.options.idleMs);
        return this.closed(closing);
    }

    async claim(agentId: string, want: WarmIdentity, now: number, signal?: AbortSignal) {
        this.scheduler.disarm(agentId);
        for (
            let running = this.scheduler.runningFor(agentId);
            running;
            running = this.scheduler.runningFor(agentId)
        ) {
            await abortable(running, signal);
        }
        signal?.throwIfAborted();
        this.scheduler.disarm(agentId);
        const claim = this.pool.claim(agentId, want, now);
        return { closing: this.closed(claim.closing), process: claim.process };
    }

    take(agentId: string) {
        this.scheduler.disarm(agentId);
        return this.closed(this.pool.take(agentId));
    }

    evictOldest() {
        return this.closed(this.pool.evictOldest((process) => process.alive));
    }

    expire(now: number) {
        return this.closed(this.pool.expire(now));
    }

    drain() {
        this.scheduler.setGate(false, []);
        return this.closed(this.pool.drain());
    }

    private closed(processes: Process[]) {
        for (const process of processes) {
            this.scheduler.disarmProcess(process);
        }
        return processes;
    }
}

async function abortable(wait: Promise<void>, signal: AbortSignal | undefined) {
    if (!signal) {
        await wait;
        return;
    }
    signal.throwIfAborted();
    const aborted = Promise.withResolvers<never>();
    const onAbort = () => aborted.reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        await Promise.race([wait, aborted.promise]);
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
}
