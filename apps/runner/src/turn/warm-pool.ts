export const warmIdleMs = 60 * 60_000;

export interface WarmIdentity {
    readonly launchKey: string;
    readonly nativeSessionId: string;
}

interface Parked<Process> extends WarmIdentity {
    readonly parkedAt: number;
    readonly process: Process;
}

export class WarmPool<Process> {
    private readonly parked = new Map<string, Parked<Process>>();

    constructor(private readonly limits: { idleMs: number; maxWarm: number }) {}

    get size() {
        return this.parked.size;
    }

    park(agentId: string, identity: WarmIdentity, process: Process, now: number) {
        const previous = this.parked.get(agentId);
        this.parked.delete(agentId);
        this.parked.set(agentId, { ...identity, parkedAt: now, process });
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
            now - entry.parkedAt < this.limits.idleMs;
        return reusable
            ? { closing: [], process: entry.process }
            : { closing: [entry.process], process: undefined };
    }

    take(agentId: string) {
        const entry = this.parked.get(agentId);
        this.parked.delete(agentId);
        return entry ? [entry.process] : [];
    }

    expire(now: number) {
        const expired: Process[] = [];
        for (const [key, entry] of this.parked) {
            if (now - entry.parkedAt >= this.limits.idleMs) {
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
