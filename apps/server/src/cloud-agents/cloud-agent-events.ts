import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, cloudAgentWorkLinksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { cloudAgentWorkUpdatedTopic } from '../realtime/topics.ts';
import { linkParentChatsTable } from './cloud-agent-work-visibility.ts';

/**
 * Prepares `cloudAgentWork.updated` for one work change about to commit: one
 * event per linking Message in a live Chat (ADR 0044), so every conversation
 * showing the card hears it. Ids only; delivery stays Chat-access scoped.
 */
export async function prepareCloudAgentWorkEvents(
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
            chatId: cloudAgentWorkLinksTable.chatId,
            kind: chatsTable.kind,
            messageId: cloudAgentWorkLinksTable.messageId,
            parentChatId: chatsTable.parentChatId,
            workId: cloudAgentWorkLinksTable.workId,
        })
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
                eq(cloudAgentWorkLinksTable.serverId, input.serverId),
                inArray(cloudAgentWorkLinksTable.workId, input.workIds),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .orderBy(asc(cloudAgentWorkLinksTable.createdAt), asc(cloudAgentWorkLinksTable.messageId));
    return links.map((link) =>
        cloudAgentWorkUpdatedTopic.prepare({
            chatId: link.chatId,
            messageId: link.messageId,
            parentChatId: link.kind === 'thread' ? link.parentChatId : null,
            serverId: input.serverId,
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
        .select({ workId: cloudAgentWorkLinksTable.workId })
        .from(cloudAgentWorkLinksTable)
        .where(
            and(
                eq(cloudAgentWorkLinksTable.serverId, input.serverId),
                inArray(cloudAgentWorkLinksTable.chatId, input.chatIds)
            )
        );
    return [...new Set(rows.map(({ workId }) => workId))];
}
