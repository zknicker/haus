import { cloudAgentCapabilityResultSchema, cloudAgentObservationFrameSchema } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { applyCloudAgentObservation } from '../cloud-agents/apply-cloud-agent-observation.ts';
import { listComputerCloudAgentWork } from '../cloud-agents/list-computer-cloud-agent-work.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { ComputerConnections } from './connections.ts';

export async function ingestCloudAgentReport(input: {
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
    const parsed = cloudAgentObservationFrameSchema.safeParse(input.frame);
    if (!parsed.success) {
        return false;
    }
    const applied = await applyCloudAgentObservation(
        input.db,
        {
            computerId: input.computerId,
            serverId: input.serverId,
            observation: parsed.data.observation,
        },
        input.delivery
    );
    if (applied) {
        for (const event of applied.events) {
            publishRealtime(event);
        }
        if (applied.wake) {
            await input.postCommitWork.wakeAgents(input.delivery, [applied.wake]);
        }
    }
    return true;
}

export async function sendCloudAgentReconcile(
    db: HausDatabase,
    connections: ComputerConnections,
    computer: { id: string; serverId: string }
) {
    const work = await listComputerCloudAgentWork(db, {
        computerId: computer.id,
        serverId: computer.serverId,
    });
    for (let offset = 0; offset < work.length; offset += 200) {
        connections.send(computer.id, {
            type: 'cloud-agent-reconcile',
            work: work.slice(offset, offset + 200),
        });
    }
}
