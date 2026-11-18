import type { CreatedAgentSummary } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import { avatarUrlFor } from '../avatars/avatar-url.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

type AgentReader = Pick<HausDatabase, 'select'>;

/**
 * Projects the `agent-created` Message body. Agents are retired, never deleted
 * (`delete-agent.ts`), so a created Agent's row always survives its Message and
 * the ADR 0025 "no body kind without its record" invariant always holds.
 */
export async function readCreatedAgentsForMessages(
    db: AgentReader,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, CreatedAgentSummary>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select(createdAgentColumns)
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                inArray(agentsTable.creationMessageId, messageIds)
            )
        );
    return new Map(
        rows.flatMap((row) =>
            row.creationMessageId ? [[row.creationMessageId, toCreatedAgent(row)] as const] : []
        )
    );
}

/** The same projection addressed by Agent id, for the create and edit receipts. */
export async function readCreatedAgent(
    db: AgentReader,
    serverId: string,
    agentId: string
): Promise<CreatedAgentSummary | null> {
    const [row] = await db
        .select(createdAgentColumns)
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, agentId)))
        .limit(1);
    return row ? toCreatedAgent(row) : null;
}

const createdAgentColumns = {
    avatarId: agentsTable.avatarId,
    creationMessageId: agentsTable.creationMessageId,
    description: agentsTable.description,
    displayName: agentsTable.displayName,
    handle: agentsTable.handle,
    id: agentsTable.id,
    retiredAt: agentsTable.retiredAt,
};

function toCreatedAgent(row: {
    avatarId: string | null;
    description: string | null;
    displayName: string;
    handle: string;
    id: string;
    retiredAt: Date | null;
}): CreatedAgentSummary {
    return {
        agentId: row.id,
        avatarUrl: avatarUrlFor(row.avatarId),
        description: row.description,
        displayName: row.displayName,
        handle: row.handle,
        retired: row.retiredAt !== null,
    };
}
