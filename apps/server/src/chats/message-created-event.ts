import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { messageCreatedTopic } from '../realtime/topics.ts';

type MessageEventReader = Pick<HausDatabase, 'execute' | 'select'>;

/**
 * Builds and validates `message.created` from the row a send is about to
 * commit (specs/realtime-events.md). The caller publishes it after commit.
 * The author, kind, and reply/anchor authors are the facts
 * `messageNotificationReason` reads; a Thread reply names its parent anchor.
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
    const anchor =
        conversation.parentChatId === null
            ? null
            : await readThreadAnchor(db, {
                  serverId: message.serverId,
                  threadChatId: message.chatId,
              });
    return messageCreatedTopic.prepare({
        authorUserId: message.authorUserId,
        chatId: message.chatId,
        conversationKind: conversation.kind,
        mentionedUserIds: message.mentionedUserIds,
        messageId: message.id,
        parentChatId: anchor ? conversation.parentChatId : null,
        replyToAuthorUserId,
        sequence: message.sequence,
        serverId: message.serverId,
        threadAnchorAuthorUserId: anchor?.authorUserId ?? null,
        threadAnchorMessageId: anchor?.messageId ?? null,
    });
}

/**
 * The Channel or DM a Chat belongs to: its own kind, or its parent's for a
 * Thread, plus the Thread's parent. The notification rule tells a DM message
 * from a Channel one by this kind (ADR 0038).
 */
async function readConversation(
    db: Pick<HausDatabase, 'execute'>,
    input: { chatId: string; serverId: string }
): Promise<{ kind: 'channel' | 'dm'; parentChatId: string | null }> {
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
    return { kind, parentChatId: rows[0]?.parent_chat_id ?? null };
}

/** A Thread's anchor Message and its human author (null for an Agent anchor). */
async function readThreadAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; threadChatId: string }
): Promise<{ authorUserId: string | null; messageId: string } | null> {
    const [anchor] = await db
        .select({
            authorUserId: chatMessagesTable.authorUserId,
            messageId: chatMessagesTable.id,
        })
        .from(chatsTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, chatsTable.serverId),
                eq(chatMessagesTable.chatId, chatsTable.parentChatId),
                eq(chatMessagesTable.id, chatsTable.anchorMessageId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.threadChatId),
                eq(chatsTable.kind, 'thread')
            )
        )
        .limit(1);
    return anchor ?? null;
}
