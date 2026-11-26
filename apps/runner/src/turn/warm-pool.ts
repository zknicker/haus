import { captainWarmIdleMs } from '@haus/api';

export const warmIdleMs = captainWarmIdleMs;

export interface WarmIdentity {
    readonly launchKey: string;
    readonly nativeSessionId: string;
}

interface Parked<Process> extends WarmIdentity {
    readonly idleMs: number;
    readonly parkedAt: number;
    readonly process: Process;
}

export class WarmPool<Process> {
    private readonly parked = new Map<string, Parked<Process>>();

    constructor(
        private readonly limits: {
            holds?: (agentId: string) => boolean;
            idleMs: number;
            maxWarm: number;
        }
    ) {}

    get size() {
        return this.parked.size;
    }

    isParked(agentId: string, process: Process) {
        return this.parked.get(agentId)?.process === process;
    }

    closingTimes() {
        return [...this.parked].map(
            ([agentId, entry]) => [agentId, entry.process, entry.parkedAt + entry.idleMs] as const
        );
    }

    park(
        agentId: string,
        identity: WarmIdentity,
        process: Process,
        now: number,
        idleMs = this.limits.idleMs
    ) {
        const previous = this.parked.get(agentId);
        this.parked.delete(agentId);
        this.parked.set(agentId, { ...identity, idleMs, parkedAt: now, process });
        const closing = previous && previous.process !== process ? [previous.process] : [];
        closing.push(...this.expire(now));
        for (const [key, entry] of this.parked) {
            if (this.parked.size <= this.limits.maxWarm) {
                break;
            }
            this.parked.delete(key);
            closing.push(entry.process);
        }
        return closing;
    }

    claim(agentId: string, want: WarmIdentity, now: number) {
        const entry = this.parked.get(agentId);
        this.parked.delete(agentId);
        if (!entry) {
            return { closing: [], process: undefined };
        }
        const reusable =
            entry.launchKey === want.launchKey &&
            entry.nativeSessionId === want.nativeSessionId &&
            now - entry.parkedAt < entry.idleMs;
        return reusable
            ? { closing: [], process: entry.process }
            : { closing: [entry.process], process: undefined };
    }

    take(agentId: string) {
        const entry = this.parked.get(agentId);
        this.parked.delete(agentId);
        return entry ? [entry.process] : [];
    }

    evictOldest(alive: (process: Process) => boolean = () => true) {
        const evicted: Process[] = [];
        for (const [agentId, entry] of this.parked) {
            this.parked.delete(agentId);
            evicted.push(entry.process);
            if (alive(entry.process)) {
                break;
            }
        }
        return evicted;
    }

    expire(now: number) {
        const expired: Process[] = [];
        for (const [key, entry] of this.parked) {
            if (now - entry.parkedAt >= entry.idleMs && !this.limits.holds?.(key)) {
                this.parked.delete(key);
                expired.push(entry.process);
            }
        }
        return expired;
    }

    drain() {
        const all = [...this.parked.values()].map((entry) => entry.process);
        this.parked.clear();
        return all;
    }
}
