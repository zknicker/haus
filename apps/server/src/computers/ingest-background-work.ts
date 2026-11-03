import {
    agentBackgroundWorkReportSchema,
    agentHeartbeatRequestSchema,
    agentSubagentWakeRequestSchema,
    agentSubagentWakeRetireSchema,
} from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { requestAgentHeartbeat } from '../agent-delivery/heartbeat-request.ts';
import {
    requestSubagentWake,
    retireSubagentWake,
} from '../agent-delivery/subagent-wake-request.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentUpdatedTopic } from '../realtime/topics.ts';
import { recordAgentBackgroundWork } from '../server-agents/record-agent-background-work.ts';
import type { ComputerConnections } from './connections.ts';

/**
 * A Computer's work outside any run: a turn it cannot start itself (a heartbeat slot or a
 * sub-agent wake, whose admission is answered on the same socket), a wake a non-wake run made
 * moot, or the background sub-agents its Agents run between turns. Returns whether `frame` was
 * one.
 */
export async function ingestBackgroundWorkFrame(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: {
        computerId: string;
        connections: Pick<ComputerConnections, 'send'>;
        frame: unknown;
        serverId: string;
    }
): Promise<boolean> {
    const { computerId, frame, serverId } = input;
    const counts = agentBackgroundWorkReportSchema.safeParse(frame);
    if (counts.success) {
        for (const agentId of await recordAgentBackgroundWork(db, computerId, counts.data)) {
            agentUpdatedTopic.announce({ agentId, serverId });
        }
        return true;
    }
    const heartbeatRequest = agentHeartbeatRequestSchema.safeParse(frame);
    if (heartbeatRequest.success) {
        await requestAgentHeartbeat(db, delivery, {
            computerId,
            request: heartbeatRequest.data,
            serverId,
        });
        return true;
    }
    const subagentWake = agentSubagentWakeRequestSchema.safeParse(frame);
    if (subagentWake.success) {
        const request = subagentWake.data;
        const outcome = await requestSubagentWake(db, delivery, { computerId, request, serverId });
        input.connections.send(computerId, {
            agentId: request.agentId,
            outcome,
            type: 'agent-subagent-wake-result',
            wakeId: request.wakeId,
        });
        return true;
    }
    const retire = agentSubagentWakeRetireSchema.safeParse(frame);
    if (retire.success) {
        await retireSubagentWake(db, { computerId, request: retire.data, serverId });
        return true;
    }
    return false;
}
