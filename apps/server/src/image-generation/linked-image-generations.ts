import type { ImageGeneration } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { imageGenerationLinksTable, imageGenerationsTable } from '../postgres/schema.ts';
import { toImageGeneration } from './image-generation-shape.ts';

/**
 * The `ChatMessage.imageGenerations` annotation for one page of Messages: each
 * Message's linked generations in link order (ADR 0044 pattern). Whoever can
 * read a Message can see the generations it links, so the caller's Message
 * authorization is the whole check. One batched read per page.
 */
export async function readLinkedImageGenerations(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, ImageGeneration[]>> {
    const byMessage = new Map<string, ImageGeneration[]>();
    if (messageIds.length === 0) {
        return byMessage;
    }
    const rows = await db
        .select({
            generation: imageGenerationsTable,
            messageId: imageGenerationLinksTable.messageId,
        })
        .from(imageGenerationLinksTable)
        .innerJoin(
            imageGenerationsTable,
            and(
                eq(imageGenerationsTable.serverId, imageGenerationLinksTable.serverId),
                eq(imageGenerationsTable.id, imageGenerationLinksTable.generationId)
            )
        )
        .where(
            and(
                eq(imageGenerationLinksTable.serverId, serverId),
                inArray(imageGenerationLinksTable.messageId, messageIds)
            )
        )
        .orderBy(asc(imageGenerationLinksTable.messageId), asc(imageGenerationLinksTable.ordinal));
    for (const { generation, messageId } of rows) {
        byMessage.set(messageId, [
            ...(byMessage.get(messageId) ?? []),
            toImageGeneration(generation),
        ]);
    }
    return byMessage;
}
