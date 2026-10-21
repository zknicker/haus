import {
    agentBackgroundWorkReportSchema,
    agentDreamRequestSchema,
    agentSubagentWakeRequestSchema,
} from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { requestAgentDream } from '../agent-delivery/dream-request.ts';
import { requestSubagentWake } from '../agent-delivery/subagent-wake-request.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentUpdatedTopic } from '../realtime/topics.ts';
import { recordAgentBackgroundWork } from '../server-agents/record-agent-background-work.ts';

/**
 * A Computer's work outside any run: a turn it cannot start itself (a nightly dream or a
 * sub-agent wake), or the background sub-agents its Agents run between turns. Returns whether
 * `frame` was one.
 */
export async function ingestBackgroundWorkFrame(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: { computerId: string; frame: unknown; serverId: string }
): Promise<boolean> {
    const { computerId, frame, serverId } = input;
    const counts = agentBackgroundWorkReportSchema.safeParse(frame);
    if (counts.success) {
        for (const agentId of await recordAgentBackgroundWork(db, computerId, counts.data)) {
            agentUpdatedTopic.announce({ agentId, serverId });
        }
        return true;
    }
    const dreamRequest = agentDreamRequestSchema.safeParse(frame);
    if (dreamRequest.success) {
        await requestAgentDream(db, delivery, { computerId, request: dreamRequest.data, serverId });
        return true;
    }
    const subagentWake = agentSubagentWakeRequestSchema.safeParse(frame);
    if (subagentWake.success) {
        await requestSubagentWake(db, delivery, {
            computerId,
            request: subagentWake.data,
            serverId,
        });
        return true;
    }
    return false;
}
