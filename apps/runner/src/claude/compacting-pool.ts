import { type WarmIdentity, WarmPool } from '../turn/warm-pool.ts';
import {
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

    setIdleCompaction(enabled: boolean) {
        this.scheduler.setEnabled(enabled, this.pool.closingTimes());
    }

    park(agentId: string, identity: WarmIdentity, process: Process, now: number) {
        const closing = this.pool.park(agentId, identity, process, now);
        this.scheduler.arm(agentId, process, now + this.options.idleMs);
        return this.closed(closing);
    }

    async claim(agentId: string, want: WarmIdentity, now: number) {
        this.scheduler.disarm(agentId);
        await this.scheduler.runningFor(agentId);
        this.scheduler.disarm(agentId);
        const claim = this.pool.claim(agentId, want, now);
        return { closing: this.closed(claim.closing), process: claim.process };
    }

    take(agentId: string) {
        this.scheduler.disarm(agentId);
        return this.closed(this.pool.take(agentId));
    }

    expire(now: number) {
        return this.closed(this.pool.expire(now));
    }

    drain() {
        this.scheduler.setEnabled(false, []);
        return this.closed(this.pool.drain());
    }

    private closed(processes: Process[]) {
        for (const process of processes) {
            this.scheduler.disarmProcess(process);
        }
        return processes;
    }
}
