import { and, eq, sql } from 'drizzle-orm';
import { requireChatWritable, requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

/**
 * Who is changing a claim. A person acts through the App as a Server member; an
 * Agent acts through the Agent API, which already resolved its target Chat
 * from the Agent's own participation.
 */
export type ClaimActor = { agentId: string; kind: 'agent' } | { kind: 'human'; member: HausUser };

/** Member-level write authority on the claim's Chat, for either kind of actor. */
export async function requireClaimActorWrite(
    tx: HausDatabase,
    actor: ClaimActor,
    input: { chatId: string; serverId: string }
) {
    if (actor.kind === 'human') {
        await requireChatWriteAccess(tx, actor.member, input);
        return;
    }
    await requireChatWritable(tx, input);
}

/** Locks the Server memberships an assignment reads, in a stable order. */
export async function lockClaimMemberships(tx: HausDatabase, serverId: string, userIds: string[]) {
    for (const userId of [...new Set(userIds)].sort()) {
        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${serverId}
              and user_id = ${userId}
              and revoked_at is null
            for update
        `);
    }
}

export async function claimActorHandle(
    tx: HausDatabase,
    actor: ClaimActor,
    serverId: string
): Promise<null | string> {
    if (actor.kind === 'agent') {
        const [agent] = await tx
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, actor.agentId)))
            .limit(1);
        return agent?.handle ?? null;
    }
    const [membership] = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, actor.member.id)
            )
        )
        .limit(1);
    return membership?.handle ?? null;
}
