import type { ChatWorker } from '@haus/api';
import { and, asc, eq, or } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, workerHistoryLinksTable, workersTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readWorkDetails, toWorker } from './worker-shape.ts';
import { linkChatVisibleSql, linkParentChatsTable } from './worker-visibility.ts';

export async function listChatWorker(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; chatId: string }
): Promise<ChatWorker[]> {
    await requireChatAccess(db, member, input);
    if (!member) {
        return [];
    }
    const rows = await db
        .select({
            messageId: workerHistoryLinksTable.messageId,
            work: workersTable,
        })
        .from(workerHistoryLinksTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerHistoryLinksTable.serverId),
                eq(workersTable.id, workerHistoryLinksTable.workerId)
            )
        )
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
                eq(workerHistoryLinksTable.serverId, input.serverId),
                or(eq(chatsTable.id, input.chatId), eq(chatsTable.parentChatId, input.chatId)),
                linkChatVisibleSql(input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(
            asc(workerHistoryLinksTable.createdAt),
            asc(workerHistoryLinksTable.messageId),
            asc(workerHistoryLinksTable.ordinal)
        );
    const details = await readWorkDetails(db, input.serverId, [
        ...new Set(rows.map(({ work }) => work.id)),
    ]);
    const seen = new Set<string>();
    const listed: ChatWorker[] = [];
    for (const { messageId, work } of rows) {
        const key = `${messageId}\0${work.id}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        listed.push({
            anchorMessageId: messageId,
            worker: toWorker(work, details.get(work.id)),
        });
    }
    return listed;
}
