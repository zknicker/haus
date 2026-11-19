import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, workerHistoryLinksTable, workersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { workerUpdatedTopic } from '../realtime/topics.ts';
import { linkParentChatsTable } from './worker-visibility.ts';

/**
 * Prepares `worker.updated` for one work change about to commit: one
 * event per linking Message in a live Chat (ADR 0044), so every conversation
 * showing the card hears it. Ids only; delivery stays Chat-access scoped.
 */
export async function prepareWorkerEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; workId: string }
): Promise<PreparedRealtimeEvent[]> {
    return await prepareLinkedWorkEvents(db, { serverId: input.serverId, workIds: [input.workId] });
}

/**
 * The same fan-out for several works at once. Chat deletion uses it so works
 * the deleted Chat linked refresh wherever they are still linked.
 */
export async function prepareLinkedWorkEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; workIds: string[] }
): Promise<PreparedRealtimeEvent[]> {
    if (input.workIds.length === 0) {
        return [];
    }
    const links = await db
        .select({
            chatId: workerHistoryLinksTable.chatId,
            messageId: workerHistoryLinksTable.messageId,
            taskId: workersTable.taskId,
            workId: workerHistoryLinksTable.workId,
        })
        .from(workerHistoryLinksTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerHistoryLinksTable.serverId),
                eq(workersTable.id, workerHistoryLinksTable.workId)
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
                inArray(workerHistoryLinksTable.workId, input.workIds),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .orderBy(asc(workerHistoryLinksTable.createdAt), asc(workerHistoryLinksTable.messageId));
    return links.map((link) =>
        workerUpdatedTopic.prepare({
            chatId: link.chatId,
            messageId: link.messageId,
            serverId: input.serverId,
            taskId: link.taskId,
            workId: link.workId,
        })
    );
}

/** Every work linked from these Chats, for deletion fan-out. */
export async function readWorkIdsLinkedFrom(
    db: Pick<HausDatabase, 'select'>,
    input: { chatIds: string[]; serverId: string }
): Promise<string[]> {
    if (input.chatIds.length === 0) {
        return [];
    }
    const rows = await db
        .select({ workId: workerHistoryLinksTable.workId })
        .from(workerHistoryLinksTable)
        .where(
            and(
                eq(workerHistoryLinksTable.serverId, input.serverId),
                inArray(workerHistoryLinksTable.chatId, input.chatIds)
            )
        );
    return [...new Set(rows.map(({ workId }) => workId))];
}
