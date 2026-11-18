import { and, eq, isNull } from 'drizzle-orm';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, chatsTable, serverMembershipsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';

export class AgentDmPeerNotFoundError extends Error {
    constructor() {
        super('That Agent or human is not an active member of this Server.');
        this.name = 'AgentDmPeerNotFoundError';
    }
}

/** Materializes exactly one DM for one active human membership stint and Agent. */
export async function ensureAgentDmRecord(
    db: HausDatabase,
    input: { agentId: string; serverId: string; userId: string }
) {
    await lockServerRow(db, input.serverId);

    // Sequential, not Promise.all: `db` is often the caller's transaction, and
    // overlapping reads on that one connection deadlocked the send against the
    // Server row lock this function's own transaction already held.
    const [standing] = await db
        .select({ stint: serverMembershipsTable.stint })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, input.serverId),
                eq(serverMembershipsTable.userId, input.userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);

    if (!(standing && agent)) {
        throw new AgentDmPeerNotFoundError();
    }

    const inserted = await db
        .insert(chatsTable)
        .values({
            dmAgentId: input.agentId,
            dmMemberOneStint: standing.stint,
            dmMemberOneUserId: input.userId,
            id: createOpaqueId('cht'),
            kind: 'dm',
            serverId: input.serverId,
        })
        .onConflictDoNothing()
        .returning({ id: chatsTable.id });

    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.kind, 'dm'),
                eq(chatsTable.dmMemberOneUserId, input.userId),
                eq(chatsTable.dmMemberOneStint, standing.stint),
                eq(chatsTable.dmAgentId, input.agentId)
            )
        )
        .limit(1);

    if (!chat) {
        throw new Error('Failed to resolve the Agent DM after creating it.');
    }

    if (inserted.length > 0) {
        await openAgentChatRead(db, {
            agentId: input.agentId,
            chatId: chat.id,
            serverId: input.serverId,
        });
    }
    return { created: inserted.length > 0, id: chat.id };
}
