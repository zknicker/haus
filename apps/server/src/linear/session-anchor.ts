import { and, asc, eq, isNull } from 'drizzle-orm';
import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { linearWorkspacesTable, serverMembershipsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';

export interface LinearSessionAnchor {
    /** Announces a DM created here; publish only after the transaction commits. */
    announce: PreparedRealtimeEvent | null;
    chatId: string;
    /** The human on the other side of the DM. */
    userId: string;
}

/**
 * Finds or creates the DM a Linear session lands in (specs/linear-app.md#anchor):
 * the one between the session's Agent and the workspace's binder, exactly as
 * an operator-created Trigger anchors on the operator's DM. When the binder is
 * no longer an active member, the Server's longest-standing active Owner
 * stands in. No Chat message is written. Runs in the caller's transaction,
 * which `ensureAgentDmRecord` puts under the Server row lock.
 */
export async function anchorLinearSession(
    tx: HausDatabase,
    input: { agentId: string; serverId: string; workspaceId: string }
): Promise<LinearSessionAnchor | null> {
    const userId = await anchorUser(tx, input);
    if (!userId) {
        return null;
    }
    const dm = await ensureAgentDmRecord(tx, {
        agentId: input.agentId,
        serverId: input.serverId,
        userId,
    });
    return {
        announce: dm.created
            ? prepareLifecycleEvent({ chatId: dm.id, serverId: input.serverId }, 'created')
            : null,
        chatId: dm.id,
        userId,
    };
}

async function anchorUser(
    tx: HausDatabase,
    input: { serverId: string; workspaceId: string }
): Promise<string | null> {
    const [binder] = await tx
        .select({ userId: serverMembershipsTable.userId })
        .from(linearWorkspacesTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, linearWorkspacesTable.serverId),
                eq(serverMembershipsTable.userId, linearWorkspacesTable.boundByUserId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .where(
            and(
                eq(linearWorkspacesTable.serverId, input.serverId),
                eq(linearWorkspacesTable.id, input.workspaceId)
            )
        )
        .limit(1);
    if (binder) {
        return binder.userId;
    }
    const [owner] = await tx
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, input.serverId),
                eq(serverMembershipsTable.role, 'owner'),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .orderBy(asc(serverMembershipsTable.joinedAt), asc(serverMembershipsTable.createdAt))
        .limit(1);
    return owner?.userId ?? null;
}
