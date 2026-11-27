import { and, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleChatSql } from '../agent-api/message-view.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { visibleChats } from './chat-visibility.ts';

export type LinkViewer = { kind: 'agent'; agentId: string } | { kind: 'user'; userId: string };

export const linkParentChatsTable = alias(chatsTable, 'link_parent_chat');

export function linkChatVisibleSql(serverId: string, viewer: LinkViewer) {
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

export async function isLiveChat(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; serverId: string }
) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .leftJoin(
            linkParentChatsTable,
            and(
                eq(linkParentChatsTable.serverId, chatsTable.serverId),
                eq(linkParentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .limit(1);
    return chat !== undefined;
}
