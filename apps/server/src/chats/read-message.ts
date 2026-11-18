import type { ChatMessageEntity, ChatMessageInput } from '@haus/api';
import { asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { listTaskPreviews } from '../tasks/task-previews.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireChatAccess } from './chat-access.ts';
import { projectChatMessages } from './project-messages.ts';
import { selectMessageRows } from './select-message-page.ts';

/**
 * `chat.message`: one message entity, projected exactly as `chat.messages`
 * projects it, with the previews of the Tasks started from it. Same
 * authorization as `chat.messages`; null when the id no longer resolves in
 * `chatId`.
 */
export async function readChatMessage(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatMessageInput
): Promise<ChatMessageEntity | null> {
    await requireChatAccess(db, member, input);

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
    const [message] = await projectChatMessages(db, input, rows);
    if (!message) {
        return null;
    }
    return {
        message,
        // ADR 0053: the Tasks started from this message, as its Channel page previews them.
        tasks: member
            ? await listTaskPreviews(db, member.id, {
                  channelId: input.chatId,
                  originMessageIds: [message.id],
                  serverId: input.serverId,
              })
            : [],
    };
}
