import type { AttachmentMetadata, ChatMessage } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readInlineReplyContext } from './reply-context.ts';

export async function readMessageRelations(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageId: string
): Promise<{
    attachments: AttachmentMetadata[];
    reactions: ChatMessage['reactions'] | undefined;
    reply: ChatMessage['reply'];
}> {
    // The caller may hold a transaction connection, so keep these reads sequential.
    const attachments = await readMessageAttachments(db, serverId, [messageId]);
    const reactions = await readChatMessageReactions(db, serverId, [messageId]);
    const [message] = await db
        .select({
            id: chatMessagesTable.id,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.serverId, serverId), eq(chatMessagesTable.id, messageId)))
        .limit(1);
    return {
        attachments: attachments.get(messageId) ?? [],
        reactions: reactions.get(messageId),
        reply: message ? await readInlineReplyContext(db, serverId, message) : null,
    };
}
