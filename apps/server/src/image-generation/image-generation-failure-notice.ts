import { formatImageGenerationLink } from '@haus/api';
import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { enqueueInboxItem, ensureDeliveryState } from '../agent-delivery/store.ts';
import { linkParentChatsTable } from '../cloud-agents/cloud-agent-work-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, imageGenerationLinksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { ImageGenerationRow } from './image-generation-shape.ts';

/** The inbox source of an image generation failure notice: concrete and bodiless (inbox-lanes.ts). */
export const imageGenerationFailedInboxSource = 'image_generation_failed';

/** The Agent to wake after a notice committed. */
export interface ImageGenerationFailureWake {
    agentId: string;
    serverId: string;
}

/**
 * Enqueues the one inbox notice a failed generation sends its requesting Agent
 * (specs/image-generation.md, "Failure notice"). It goes to the earliest live
 * Chat whose Message links the generation, where people saw the card fail. A
 * generation no live Message links yet notifies nobody: a chatless inbox item
 * would need its own lane, and the Agent that never posted the link either is
 * waiting on the generation or nobody saw the card. The dedupe key is the
 * generation, so a repeat settle never notifies twice. Success never calls this.
 */
export async function enqueueImageGenerationFailureNotice(
    db: HausDatabase,
    row: Pick<
        ImageGenerationRow,
        'agentId' | 'failureReason' | 'id' | 'modelDisplayName' | 'serverId'
    >
): Promise<ImageGenerationFailureWake | null> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, row.serverId);
        const [link] = await tx
            .select({ chatId: imageGenerationLinksTable.chatId })
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
                    eq(imageGenerationLinksTable.serverId, row.serverId),
                    eq(imageGenerationLinksTable.generationId, row.id),
                    isNull(chatsTable.deletedAt),
                    or(
                        isNull(chatsTable.parentChatId),
                        and(
                            isNotNull(linkParentChatsTable.id),
                            isNull(linkParentChatsTable.deletedAt)
                        )
                    )
                )
            )
            .orderBy(
                asc(imageGenerationLinksTable.createdAt),
                asc(imageGenerationLinksTable.messageId)
            )
            .limit(1);
        if (!link) {
            return null;
        }
        await ensureDeliveryState(tx, { agentId: row.agentId, serverId: row.serverId });
        await enqueueInboxItem(tx, {
            agentId: row.agentId,
            chatId: link.chatId,
            content: imageGenerationFailureNoticeText(row),
            dedupeKey: `image-generation-failed:${row.id}`,
            serverId: row.serverId,
            source: imageGenerationFailedInboxSource,
        });
        return { agentId: row.agentId, serverId: row.serverId };
    });
}

export function imageGenerationFailureNoticeText(
    row: Pick<ImageGenerationRow, 'failureReason' | 'id' | 'modelDisplayName'>
): string {
    return [
        `⚠️ Image generation failed: ${row.modelDisplayName}`,
        formatImageGenerationLink(row.id),
        `Reason: ${row.failureReason ?? 'The Server could not finish this image.'}`,
        'Next: tell the person it failed; if a retry would help, run haus image generate with another model.',
    ].join('\n');
}
