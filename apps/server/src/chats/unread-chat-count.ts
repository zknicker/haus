import { and, count, eq, gt, isNull, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, serverMembershipsTable, serversTable } from '../postgres/schema.ts';
import { unreadTasks } from '../tasks/task-unread.ts';
import { chatUnreadCount, listedChats } from './chat-unread.ts';

export async function countUnreadInboxRows(
    db: Pick<HausDatabase, 'select'>,
    userId: string
): Promise<number> {
    const chats = await countMemberChats(
        db,
        userId,
        and(listedChats(userId, 'active'), gt(chatUnreadCount(userId), 0))
    );
    const taskChats = await countMemberChats(db, userId, unreadTasks(userId));
    return chats + taskChats;
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
