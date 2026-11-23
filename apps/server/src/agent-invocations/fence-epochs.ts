import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';

interface FenceScope {
    agentId: string;
    computerId: string;
    serverId: string;
}

export function createFenceEpochs() {
    const epochs = new Map<string, number>();
    const read = (target: FenceScope) => epochs.get(keyOf(target)) ?? 0;
    return {
        bump(target: FenceScope) {
            epochs.set(keyOf(target), read(target) + 1);
        },
        async allowsSend(db: HausDatabase, target: FenceScope) {
            const epoch = read(target);
            const allowed = await isAgentAllowedOn(db, target);
            return allowed && read(target) === epoch;
        },
    };
}

function keyOf(target: FenceScope) {
    return `${target.agentId}:${target.computerId}`;
}
