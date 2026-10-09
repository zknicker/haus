import type { ChatMessageEntity, ChatMessageInput } from '@haus/api';
import { asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { requireThreadAccess } from '../threads/resolve-thread-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ChatNotFoundError, requireChatAccess } from './chat-access.ts';
import { projectChatMessages } from './project-messages.ts';
import { selectMessageRows } from './select-message-page.ts';

/**
 * `chat.message`: one message entity, projected exactly as `chat.messages`
 * projects it, with the viewer's Thread summary when it anchors one. Same
 * authorization as `chat.messages`; null when the id no longer resolves in
 * `chatId`.
 */
export async function readChatMessage(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatMessageInput
): Promise<ChatMessageEntity | null> {
    try {
        await requireChatAccess(db, member, input);
    } catch (cause) {
        if (!(cause instanceof ChatNotFoundError)) {
            throw cause;
        }
        // A task Thread nobody has replied in has no Chat row, so no messages.
        await requireThreadAccess(db, member, {
            serverId: input.serverId,
            threadChatId: input.chatId,
        });
        return null;
    }

    const rows = await selectMessageRows(
        db,
        [
            eq(chatMessagesTable.serverId, input.serverId),
            eq(chatMessagesTable.chatId, input.chatId),
            eq(chatMessagesTable.id, input.messageId),
        ],
        asc(chatMessagesTable.sequence),
        1
    );
    if (rows.length === 0) {
        return null;
    }
    const { messages, threads } = await projectChatMessages(db, member, input, rows);
    const [message] = messages;
    if (!message) {
        return null;
    }
    return {
        message,
        thread: threads.find((thread) => thread.anchorMessageId === message.id) ?? null,
    };
}
