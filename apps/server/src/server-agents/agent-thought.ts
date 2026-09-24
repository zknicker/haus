import { type AgentThoughtEvent, type AgentThoughtFrame, agentThoughtFrameSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readActiveRunEngagements } from '../agent-delivery/chat-engagement.ts';
import { announceAgentThought } from '../agent-delivery/thought-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentsTable } from '../postgres/schema.ts';

/** Handles a Computer frame when it is a thought; true once consumed, admitted or not. */
export async function ingestComputerAgentThought(
    db: HausDatabase,
    input: { computerId: string; frame: unknown; serverId: string }
): Promise<boolean> {
    const thought = agentThoughtFrameSchema.safeParse(input.frame);
    if (!thought.success) {
        return false;
    }
    const events = await admitComputerAgentThought(db, { ...input, frame: thought.data });
    for (const event of events) {
        announceAgentThought(event);
    }
    return true;
}

/**
 * Admits a Computer's thought for its Agent's active, accepted run — the same
 * identity checks as a Computer activity frame — and writes nothing. Returns
 * one event per Chat the run engages now, so only readers of those Chats hear
 * it; none when the Computer, Agent, or run does not match or nothing is engaged.
 */
export async function admitComputerAgentThought(
    db: HausDatabase,
    input: { computerId: string; frame: AgentThoughtFrame; serverId: string }
): Promise<AgentThoughtEvent[]> {
    const [row] = await db
        .select({
            acceptedAt: agentDeliveryTable.acceptedAt,
            activeRunComputerId: agentDeliveryTable.activeRunComputerId,
            activeRunId: agentDeliveryTable.activeRunId,
        })
        .from(agentsTable)
        .innerJoin(agentDeliveryTable, eq(agentDeliveryTable.agentId, agentsTable.id))
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.frame.agentId),
                eq(agentsTable.computerId, input.computerId)
            )
        )
        .limit(1);
    if (
        row?.activeRunComputerId !== input.computerId ||
        row.activeRunId !== input.frame.runId ||
        row.acceptedAt === null
    ) {
        return [];
    }
    const engagements = await readActiveRunEngagements(db, {
        agentId: input.frame.agentId,
        runId: input.frame.runId,
        serverId: input.serverId,
    });
    return engagements.map((engagement) => ({
        agentId: input.frame.agentId,
        at: input.frame.at,
        chatId: engagement.chatId,
        runId: input.frame.runId,
        serverId: input.serverId,
        text: input.frame.text,
    }));
}
