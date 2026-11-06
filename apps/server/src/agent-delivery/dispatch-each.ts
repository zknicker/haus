import type { AgentDelivery } from './delivery.ts';

/** One Agent a sweep could not dispatch, and the kind of failure that stopped it. */
export interface DispatchFailure {
    agentId: string;
    failureKind: string;
}

export class DeliverySweepError extends Error {
    override readonly name = 'DeliverySweepError';

    constructor(readonly failures: DispatchFailure[]) {
        super(`${failures.length} Agent dispatches failed.`);
    }
}

/** Tries every candidate, so one Agent that cannot dispatch never blocks the rest. */
export async function dispatchEach(
    delivery: Pick<AgentDelivery, 'dispatchAgent'>,
    candidates: { agentId: string; serverId: string }[]
): Promise<void> {
    const failures: DispatchFailure[] = [];
    for (const candidate of candidates) {
        try {
            await delivery.dispatchAgent(candidate.agentId, candidate.serverId);
        } catch (cause) {
            failures.push({
                agentId: candidate.agentId,
                failureKind: cause instanceof Error ? cause.name : typeof cause,
            });
        }
    }
    if (failures.length > 0) {
        throw new DeliverySweepError(failures);
    }
}
