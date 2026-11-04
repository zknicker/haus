import { and, eq } from 'drizzle-orm';
import { ChatNotFoundError, requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { anchorMessageIdForThreadChatId } from './thread-id.ts';

export interface ThreadAccess {
    anchorMessageId: string;
    /** False while nobody has replied yet, so the Thread has no Chat row. */
    materialized: boolean;
    parentChatId: string;
}

/**
 * A Thread's id is derived from its anchor, so it is addressable before anyone
 * replies. Reads resolve that name against the anchor's parent Chat and answer
 * with an empty Thread rather than a missing one — which is what keeps a claim
 * deep link working when the claim's Thread was never needed.
 */
export async function requireThreadAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; threadChatId: string }
): Promise<ThreadAccess> {
    try {
        const thread = await requireChatAccess(db, member, {
            chatId: input.threadChatId,
            serverId: input.serverId,
        });
        if (thread.kind !== 'thread' || !thread.parentChatId) {
            throw new ChatNotFoundError();
        }
        const anchorMessageId = anchorMessageIdForThreadChatId(input.threadChatId);
        if (!anchorMessageId) {
            throw new ChatNotFoundError();
        }
        return { anchorMessageId, materialized: true, parentChatId: thread.parentChatId };
    } catch (cause) {
        if (!(cause instanceof ChatNotFoundError)) {
            throw cause;
        }
        return await resolvePendingThread(db, member, input);
    }
}

async function resolvePendingThread(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; threadChatId: string }
): Promise<ThreadAccess> {
    const anchorMessageId = anchorMessageIdForThreadChatId(input.threadChatId);
    if (!anchorMessageId) {
        throw new ChatNotFoundError();
    }
    const [anchor] = await db
        .select({ chatId: chatMessagesTable.chatId })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, anchorMessageId)
            )
        )
        .limit(1);
    if (!anchor) {
        throw new ChatNotFoundError();
    }
    const parent = await requireChatAccess(db, member, {
        chatId: anchor.chatId,
        serverId: input.serverId,
    });
    if (parent.kind === 'thread') {
        throw new ChatNotFoundError();
    }
    return { anchorMessageId, materialized: false, parentChatId: anchor.chatId };
}
