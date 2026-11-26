import type { InvocationClock } from './invocation-clock.ts';

export const desktopLeaseIdleMs = 60_000;

interface Lease {
    agentId: string;
    idle: { cancel(): void };
    runId: string;
}

interface Holder {
    agentId: string;
    runId: string;
}

interface Machine {
    computerId: string;
    serverId: string;
}

export type DesktopLeases = ReturnType<typeof createDesktopLeases>;

export function createDesktopLeases(clock: InvocationClock) {
    const leases = new Map<string, Lease>();

    function release(key: string) {
        leases.get(key)?.idle.cancel();
        leases.delete(key);
    }

    function hold(key: string, holder: Holder) {
        leases.get(key)?.idle.cancel();
        leases.set(key, {
            ...holder,
            idle: clock.schedule(() => release(key), desktopLeaseIdleMs),
        });
    }

    return {
        claim(machine: Machine, holder: Holder) {
            const key = keyOf(machine);
            const lease = leases.get(key);
            if (lease && lease.agentId !== holder.agentId) {
                return { agentId: lease.agentId, kind: 'busy' as const };
            }
            hold(key, holder);
            return { kind: 'held' as const };
        },
        refresh(machine: Machine, holder: Holder) {
            const key = keyOf(machine);
            const lease = leases.get(key);
            if (lease?.agentId === holder.agentId && lease.runId === holder.runId) {
                hold(key, holder);
            }
        },
        releaseAgent(agentId: string, machine?: Machine) {
            for (const [key, lease] of leases) {
                if (lease.agentId === agentId && (!machine || key === keyOf(machine))) {
                    release(key);
                }
            }
        },
        releaseRun(runId: string) {
            for (const [key, lease] of leases) {
                if (lease.runId === runId) {
                    release(key);
                }
            }
        },
        holder: (machine: Machine) => leases.get(keyOf(machine))?.agentId ?? null,
        close() {
            for (const key of [...leases.keys()]) {
                release(key);
            }
        },
    };
}

function keyOf(machine: Machine) {
    return `${machine.serverId}:${machine.computerId}`;
}
