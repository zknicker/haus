import { and, count, eq, gt, isNull, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatsTable,
    serverMembershipsTable,
    serversTable,
    taskInboxItemsTable,
} from '../postgres/schema.ts';
import { unreadThreads } from '../threads/thread-unread.ts';
import { chatUnreadCount, listedChats } from './chat-unread.ts';

/**
 * How many unread Inbox rows a human has across every live Server they
 * currently belong to: Channels and DMs with anything unread, unread Threads
 * (ADR 0043), and uncleared Task items (ADR 0051). Each part is one query built
 * from the predicate its list uses — `chat.list`'s `listedChats` and
 * `chatUnreadCount`, `thread.listUnread`'s `unreadThreads`, and `taskInbox.list`'s
 * uncleared rows — so it equals those lists' rows summed over Servers, and the
 * iPhone badge and the Inbox never disagree. Membership is a join, not a
 * precondition: a Server the human just left simply stops counting.
 */
export async function countUnreadInboxRows(
    db: Pick<HausDatabase, 'select'>,
    userId: string
): Promise<number> {
    const chats = await countMemberChats(
        db,
        userId,
        and(listedChats(userId, 'active'), gt(chatUnreadCount(userId), 0))
    );
    const threads = await countMemberChats(db, userId, unreadThreads(userId));
    const tasks = await countUnclearedTaskItems(db, userId);
    return chats + threads + tasks;
}

async function countUnclearedTaskItems(
    db: Pick<HausDatabase, 'select'>,
    userId: string
): Promise<number> {
    const [row] = await db
        .select({ count: count() })
        .from(taskInboxItemsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, taskInboxItemsTable.serverId),
                eq(serverMembershipsTable.userId, userId),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .innerJoin(
            serversTable,
            and(eq(serversTable.id, taskInboxItemsTable.serverId), isNull(serversTable.deletedAt))
        )
        .where(and(eq(taskInboxItemsTable.userId, userId), isNull(taskInboxItemsTable.clearedAt)));
    return row?.count ?? 0;
}

async function countMemberChats(
    db: Pick<HausDatabase, 'select'>,
    userId: string,
    where: SQL | undefined
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
        .where(where);
    return row?.count ?? 0;
}
