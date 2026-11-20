import {
    cloudAgentCapabilityResultSchema,
    workerFollowUpDrainFrameSchema,
    workerObservationFrameSchema,
    workerTurnAcceptedFrameSchema,
} from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { applyWorkerObservation } from '../workers/apply-worker-observation.ts';
import {
    acceptWorkerTurn,
    drainWorkerFollowUp,
    planCarrierReconnect,
} from '../workers/carrier-frames.ts';
import { commitWorkerEffects } from '../workers/worker-effects.ts';
import type { ComputerConnections } from './connections.ts';

export async function ingestWorkerReport(input: {
    db: HausDatabase;
    computerId: string;
    serverId: string;
    frame: unknown;
    connections: ComputerConnections;
    delivery: AgentDelivery;
    postCommitWork: ServerPostCommitWork;
}): Promise<boolean> {
    const capability = cloudAgentCapabilityResultSchema.safeParse(input.frame);
    if (capability.success) {
        input.connections.acceptCloudAgentCapabilityResult(input.computerId, capability.data);
        return true;
    }
    const effects = await applyCarrierFrame(input);
    if (effects === undefined) {
        return false;
    }
    if (effects) {
        await commitWorkerEffects(effects, {
            agentDelivery: input.delivery,
            connections: input.connections,
            postCommitWork: input.postCommitWork,
        });
    }
    return true;
}

export async function reconnectWorkerCarrier(
    db: HausDatabase,
    sinks: {
        connections: ComputerConnections;
        delivery: AgentDelivery;
        postCommitWork: ServerPostCommitWork;
    },
    computer: { id: string; serverId: string }
) {
    const effects = await planCarrierReconnect(db, computer);
    await commitWorkerEffects(effects, {
        agentDelivery: sinks.delivery,
        connections: sinks.connections,
        postCommitWork: sinks.postCommitWork,
    });
}

async function applyCarrierFrame(input: {
    computerId: string;
    db: HausDatabase;
    delivery: AgentDelivery;
    frame: unknown;
    serverId: string;
}) {
    const { computerId, db, serverId } = input;
    const observation = workerObservationFrameSchema.safeParse(input.frame);
    if (observation.success) {
        return await applyWorkerObservation(
            db,
            { computerId, observation: observation.data.observation, serverId },
            input.delivery
        );
    }
    const accepted = workerTurnAcceptedFrameSchema.safeParse(input.frame);
    if (accepted.success) {
        return await acceptWorkerTurn(db, { computerId, serverId, turnId: accepted.data.turnId });
    }
    const drained = workerFollowUpDrainFrameSchema.safeParse(input.frame);
    if (drained.success) {
        return await drainWorkerFollowUp(db, { computerId, frame: drained.data, serverId });
    }
    return undefined;
}
