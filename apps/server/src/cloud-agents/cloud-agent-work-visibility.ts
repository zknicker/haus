import { and, eq, exists, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleChatSql } from '../agent-api/message-view.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, cloudAgentWorkLinksTable, cloudAgentWorkTable } from '../postgres/schema.ts';

/** Who is asking to see Cloud Agent work: a member, or an Agent. */
export type CloudAgentWorkViewer =
    | { kind: 'agent'; agentId: string }
    | { kind: 'user'; userId: string };

/** The parent of a link's Chat when that Chat is a Thread; join it on `chatsTable`. */
export const linkParentChatsTable = alias(chatsTable, 'link_parent_chat');

/**
 * Whether a viewer can read the Chat one link lives in (ADR 0044): the Chat
 * and, for a Thread, its parent are live, and the viewer can read it by the
 * canonical rule. A human also needs an active Server membership; a
 * tombstoned Chat grants nothing even before its purge removes the rows.
 * Apply over `chatsTable` joined to the link and `linkParentChatsTable`
 * left-joined to that Chat's parent.
 */
export function linkChatVisibleSql(serverId: string, viewer: CloudAgentWorkViewer): SQL {
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
 * The one "may this viewer see this work?" predicate over `cloudAgentWorkTable`:
 * some link lives in a Chat the viewer can read. The delegating Agent always
 * sees its own work. Used by link authorization, lists, and annotations.
 */
export function cloudAgentWorkVisibleSql(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    viewer: CloudAgentWorkViewer
): SQL {
    const linked = exists(
        db
            .select({ one: sql`1` })
            .from(cloudAgentWorkLinksTable)
            .innerJoin(
                chatsTable,
                and(
                    eq(chatsTable.serverId, cloudAgentWorkLinksTable.serverId),
                    eq(chatsTable.id, cloudAgentWorkLinksTable.chatId)
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
                    eq(cloudAgentWorkLinksTable.serverId, cloudAgentWorkTable.serverId),
                    eq(cloudAgentWorkLinksTable.workId, cloudAgentWorkTable.id),
                    linkChatVisibleSql(serverId, viewer)
                )
            )
    );
    return viewer.kind === 'agent'
        ? (or(eq(cloudAgentWorkTable.agentId, viewer.agentId), linked) as SQL)
        : linked;
}

/** Which of these work ids exist in the Server and are visible to the viewer. */
export async function readVisibleCloudAgentWorkIds(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; viewer: CloudAgentWorkViewer; workIds: string[] }
): Promise<Set<string>> {
    if (input.workIds.length === 0) {
        return new Set();
    }
    const rows = await db
        .select({ id: cloudAgentWorkTable.id })
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                inArray(cloudAgentWorkTable.id, input.workIds),
                cloudAgentWorkVisibleSql(db, input.serverId, input.viewer)
            )
        );
    return new Set(rows.map(({ id }) => id));
}
