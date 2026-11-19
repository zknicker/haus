import { cloudAgentCapabilityResultSchema, workerObservationFrameSchema } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { applyWorkerObservation } from '../workers/apply-worker-observation.ts';
import { listComputerWorker } from '../workers/list-computer-worker.ts';
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
    const parsed = workerObservationFrameSchema.safeParse(input.frame);
    if (!parsed.success) {
        return false;
    }
    const applied = await applyWorkerObservation(
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

export async function sendWorkerReconcile(
    db: HausDatabase,
    connections: ComputerConnections,
    computer: { id: string; serverId: string }
) {
    const work = await listComputerWorker(db, {
        computerId: computer.id,
        serverId: computer.serverId,
    });
    for (let offset = 0; offset < work.length; offset += 200) {
        connections.send(computer.id, {
            type: 'worker-reconcile',
            work: work.slice(offset, offset + 200),
        });
    }
}
