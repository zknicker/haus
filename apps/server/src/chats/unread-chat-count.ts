import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, serverMembershipsTable, serversTable } from '../postgres/schema.ts';
import { chatUnreadCount, listedChats } from './chat-unread.ts';

/**
 * How many of a human's Channels and DMs, across every live Server they
 * currently belong to, have anything unread. One query, built from the same
 * `listedChats` scope and `chatUnreadCount` expression `chat.list` uses, so it
 * equals the number of `chat.list` rows with `unreadCount > 0` summed over
 * Servers — the iPhone badge and the Inbox's Unread section never disagree.
 * Membership is a join, not a precondition: a Server the human just left simply
 * stops counting.
 */
export async function countUnreadChats(
    db: Pick<HausDatabase, 'select'>,
    userId: string
): Promise<number> {
    const [row] = await db
        .select({ count: count() })
        .from(chatsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, chatsTable.serverId),
                eq(serverMembershipsTable.userId, userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .innerJoin(
            serversTable,
            and(eq(serversTable.id, chatsTable.serverId), isNull(serversTable.deletedAt))
        )
        .where(and(listedChats(userId, 'active'), gt(chatUnreadCount(userId), 0)));
    return row?.count ?? 0;
}
