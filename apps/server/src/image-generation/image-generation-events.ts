import { and, asc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { linkParentChatsTable } from '../cloud-agents/cloud-agent-work-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, imageGenerationLinksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { imageGenerationUpdatedTopic } from '../realtime/topics.ts';

/**
 * Prepares `imageGeneration.onUpdated` for generations about to change or be
 * linked: one event per linking Message in a live Chat (ADR 0044 pattern), so
 * every conversation showing the card hears it. Ids only; delivery stays
 * Chat-access scoped.
 */
export async function prepareImageGenerationEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { generationIds: string[]; serverId: string }
): Promise<PreparedRealtimeEvent[]> {
    if (input.generationIds.length === 0) {
        return [];
    }
    const links = await db
        .select({
            chatId: imageGenerationLinksTable.chatId,
            generationId: imageGenerationLinksTable.generationId,
            kind: chatsTable.kind,
            messageId: imageGenerationLinksTable.messageId,
            parentChatId: chatsTable.parentChatId,
        })
        .from(imageGenerationLinksTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, imageGenerationLinksTable.serverId),
                eq(chatsTable.id, imageGenerationLinksTable.chatId)
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
                eq(imageGenerationLinksTable.serverId, input.serverId),
                inArray(imageGenerationLinksTable.generationId, input.generationIds),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .orderBy(
            asc(imageGenerationLinksTable.createdAt),
            asc(imageGenerationLinksTable.messageId)
        );
    return links.map((link) =>
        imageGenerationUpdatedTopic.prepare({
            chatId: link.chatId,
            generationId: link.generationId,
            messageId: link.messageId,
            parentChatId: link.kind === 'thread' ? link.parentChatId : null,
            serverId: input.serverId,
        })
    );
}
