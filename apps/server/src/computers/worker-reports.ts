import {
    cloudAgentCapabilityResultSchema,
    workerFollowUpDrainFrameSchema,
    workerObservationFrameSchema,
    workerTurnAcceptedFrameSchema,
} from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { applyWorkerObservation } from '../workers/apply-worker-observation.ts';
import {
    acceptWorkerTurn,
    drainWorkerFollowUp,
    planCarrierReconnect,
} from '../workers/carrier-frames.ts';
import { commitWorkerEffects } from '../workers/worker-effects.ts';
import { applyComputerTurnFrame } from './computer-turn-frame-ingest.ts';
import type { ComputerConnections } from './connections.ts';

export async function ingestWorkerReport(input: {
    db: HausDatabase;
    computerId: string;
    serverId: string;
    frame: unknown;
    connections: ComputerConnections;
    delivery: AgentDelivery;
    postCommitWork: ServerPostCommitWork;
    storage: ArtifactStorage | null;
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
        storage: ArtifactStorage | null;
    },
    computer: { id: string; serverId: string }
) {
    const effects = await planCarrierReconnect(db, computer, sinks.storage);
    await commitWorkerEffects(effects, {
        agentDelivery: sinks.delivery,
        connections: sinks.connections,
        postCommitWork: sinks.postCommitWork,
    });
}

interface CarrierFrameInput {
    computerId: string;
    db: HausDatabase;
    delivery: AgentDelivery;
    frame: unknown;
    serverId: string;
    storage: ArtifactStorage | null;
}

async function applyCarrierFrame(input: CarrierFrameInput) {
    const { computerId, db, serverId, storage } = input;
    const observation = workerObservationFrameSchema.safeParse(input.frame);
    if (observation.success) {
        return await applyWorkerObservation(
            db,
            { computerId, observation: observation.data.observation, serverId },
            input.delivery,
            storage
        );
    }
    const accepted = workerTurnAcceptedFrameSchema.safeParse(input.frame);
    if (accepted.success) {
        return await acceptWorkerTurn(
            db,
            { computerId, serverId, turnId: accepted.data.turnId },
            storage
        );
    }
    const computerTurn = await applyComputerTurnFrame(input);
    return computerTurn === undefined ? await applyDrainFrame(input) : computerTurn;
}

async function applyDrainFrame(input: CarrierFrameInput) {
    const { computerId, db, serverId, storage } = input;
    const drained = workerFollowUpDrainFrameSchema.safeParse(input.frame);
    if (drained.success) {
        return await drainWorkerFollowUp(
            db,
            { computerId, frame: drained.data, serverId },
            storage
        );
    }
    return undefined;
}
