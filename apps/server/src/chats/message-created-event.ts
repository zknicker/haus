import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageCreatedTopic } from '../realtime/topics.ts';
import { findTaskByChatId } from '../tasks/task-chat.ts';

type MessageEventReader = Pick<HausDatabase, 'execute' | 'select'>;

/**
 * Builds and validates `message.created` from the row a send is about to
 * commit (specs/realtime-events.md). The caller publishes it after commit.
 * The author, kind, and reply author are the facts `messageNotificationReason`
 * reads.
 */
export async function prepareMessageCreatedEvent(
    db: MessageEventReader,
    message: {
        authorUserId: string | null;
        chatId: string;
        id: string;
        mentionedUserIds: string[];
        sequence: number;
        serverId: string;
    },
    /** The inline parent's human author, when this is a reply to a human. */
    replyToAuthorUserId: string | null
) {
    const conversation = await readConversation(db, {
        chatId: message.chatId,
        serverId: message.serverId,
    });
    // Only a child Chat can be a Task's (ADR 0053).
    const task = conversation.inTask
        ? await findTaskByChatId(db, { chatId: message.chatId, serverId: message.serverId })
        : null;
    return messageCreatedTopic.prepare({
        authorUserId: message.authorUserId,
        chatId: message.chatId,
        conversationKind: conversation.kind,
        mentionedUserIds: message.mentionedUserIds,
        messageId: message.id,
        replyToAuthorUserId,
        sequence: message.sequence,
        serverId: message.serverId,
        taskId: task?.taskId ?? null,
    });
}

/**
 * The Channel or DM a Chat belongs to: its own kind, or its origin Channel's
 * for a Task. The notification rule tells a DM message from a Channel one by
 * this kind (ADR 0038).
 */
async function readConversation(
    db: Pick<HausDatabase, 'execute'>,
    input: { chatId: string; serverId: string }
): Promise<{ inTask: boolean; kind: 'channel' | 'dm' }> {
    const rows = (await db.execute(sql`
        select coalesce(parent.kind, chat.kind) as kind, parent.id as parent_chat_id
        from chats chat
        left join chats parent
            on parent.server_id = chat.server_id and parent.id = chat.parent_chat_id
        where chat.server_id = ${input.serverId} and chat.id = ${input.chatId}
    `)) as Array<{ kind: string; parent_chat_id: string | null }>;
    const kind = rows[0]?.kind;
    if (kind !== 'channel' && kind !== 'dm') {
        throw new Error(`Chat ${input.chatId} has no Channel or DM conversation.`);
    }
    return { inTask: (rows[0]?.parent_chat_id ?? null) !== null, kind };
}
