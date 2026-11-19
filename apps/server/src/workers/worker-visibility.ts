import { and, eq, exists, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleChatSql } from '../agent-api/message-view.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, workerHistoryLinksTable, workersTable } from '../postgres/schema.ts';

/** Who is asking to see Worker: a member, or an Agent. */
export type WorkerViewer = { kind: 'agent'; agentId: string } | { kind: 'user'; userId: string };

export const linkParentChatsTable = alias(chatsTable, 'link_parent_chat');

export function linkChatVisibleSql(serverId: string, viewer: WorkerViewer): SQL {
    const live = and(
        isNull(chatsTable.deletedAt),
        or(
            isNull(chatsTable.parentChatId),
            and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
        )
    ) as SQL;
    if (viewer.kind === 'agent') {
        return and(live, visibleChatSql({ agentId: viewer.agentId, serverId })) as SQL;
    }
    return and(
        live,
        sql`exists (
            select 1 from server_memberships viewer_membership
            where viewer_membership.server_id = ${serverId}
                and viewer_membership.user_id = ${viewer.userId}
                and viewer_membership.revoked_at is null
        )`,
        visibleChats(viewer.userId)
    ) as SQL;
}

/**
 * The one "may this viewer see this work?" predicate over `workersTable`:
 * some link lives in a Chat the viewer can read. The delegating Agent always
 * sees its own work. Used by link authorization, lists, and annotations.
 */
export function workerVisibleSql(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    viewer: WorkerViewer
): SQL {
    const linked = exists(
        db
            .select({ one: sql`1` })
            .from(workerHistoryLinksTable)
            .innerJoin(
                chatsTable,
                and(
                    eq(chatsTable.serverId, workerHistoryLinksTable.serverId),
                    eq(chatsTable.id, workerHistoryLinksTable.chatId)
                )
            )
            .leftJoin(
                linkParentChatsTable,
                and(
                    eq(linkParentChatsTable.serverId, chatsTable.serverId),
                    eq(linkParentChatsTable.id, chatsTable.parentChatId)
                )
            )
            .where(
                and(
                    eq(workerHistoryLinksTable.serverId, workersTable.serverId),
                    eq(workerHistoryLinksTable.workerId, workersTable.id),
                    linkChatVisibleSql(serverId, viewer)
                )
            )
    );
    return viewer.kind === 'agent'
        ? (or(eq(workersTable.agentId, viewer.agentId), linked) as SQL)
        : linked;
}

/** Which of these work ids exist in the Server and are visible to the viewer. */
export async function readVisibleWorkerIds(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; viewer: WorkerViewer; workerIds: string[] }
): Promise<Set<string>> {
    if (input.workerIds.length === 0) {
        return new Set();
    }
    const rows = await db
        .select({ id: workersTable.id })
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                inArray(workersTable.id, input.workerIds),
                workerVisibleSql(db, input.serverId, input.viewer)
            )
        );
    return new Set(rows.map(({ id }) => id));
}
