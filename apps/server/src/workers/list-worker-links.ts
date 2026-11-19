import type { WorkerLink } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, workerHistoryLinksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { linkChatVisibleSql, linkParentChatsTable } from './worker-visibility.ts';

/** Every conversation the viewer can read that links this work, once each, oldest link first. */
export async function listWorkerLinks(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; workerIds: string[] }
): Promise<WorkerLink[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member || input.workerIds.length === 0) {
        return [];
    }
    const rows = await db
        .select({
            chatId: chatsTable.id,
            parentChatId: chatsTable.parentChatId,
            workerId: workerHistoryLinksTable.workerId,
        })
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
                eq(workerHistoryLinksTable.serverId, input.serverId),
                inArray(workerHistoryLinksTable.workerId, input.workerIds),
                linkChatVisibleSql(input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(asc(workerHistoryLinksTable.createdAt));

    const links = new Map<string, WorkerLink>();
    for (const { chatId, parentChatId, workerId } of rows) {
        const link = { chatId: parentChatId ?? chatId, workerId };
        links.set(`${workerId}\0${link.chatId}`, link);
    }
    return [...links.values()];
}
