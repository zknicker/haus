import { and, eq, exists, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleChatSql } from '../agent-api/message-view.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatsTable,
    tasksTable,
    workerHistoryLinksTable,
    workersTable,
} from '../postgres/schema.ts';

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
 * The one "may this viewer see this Worker?" predicate over `workersTable`:
 * the viewer can read its Task's Chat, or, for read-only history, some link
 * lives in a Chat the viewer can read. The delegating Agent always sees its
 * own Workers. Used by link authorization, lists, and annotations.
 */
export function workerVisibleSql(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    viewer: WorkerViewer
): SQL {
    const inReadableTask = exists(
        db
            .select({ one: sql`1` })
            .from(tasksTable)
            .innerJoin(
                chatsTable,
                and(
                    eq(chatsTable.serverId, tasksTable.serverId),
                    eq(chatsTable.id, tasksTable.chatId)
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
                    eq(tasksTable.serverId, workersTable.serverId),
                    eq(tasksTable.id, workersTable.taskId),
                    linkChatVisibleSql(serverId, viewer)
                )
            )
    );
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
        ? (or(eq(workersTable.agentId, viewer.agentId), inReadableTask, linked) as SQL)
        : (or(inReadableTask, linked) as SQL);
}

/** Which of these history Worker ids exist and are visible; only history may be linked. */
export async function readLinkableWorkerIds(
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
                isNull(workersTable.taskId),
                workerVisibleSql(db, input.serverId, input.viewer)
            )
        );
    return new Set(rows.map(({ id }) => id));
}

export async function canSeeWorker(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; viewer: WorkerViewer; workerId: string }
) {
    const [row] = await db
        .select({ id: workersTable.id })
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                eq(workersTable.id, input.workerId),
                workerVisibleSql(db, input.serverId, input.viewer)
            )
        )
        .limit(1);
    return row !== undefined;
}
