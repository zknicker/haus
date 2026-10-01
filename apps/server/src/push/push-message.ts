import { sql } from 'drizzle-orm';
import type { StoredChatMessageAuthorRow } from '../chats/message-shape.ts';
import type { HausDatabase } from '../postgres/connection.ts';

/** One new message as a push renders it: its author, words, and place. */
export interface PushMessage extends StoredChatMessageAuthorRow {
    anchorMessageId: string | null;
    authorAgentAvatarId: string | null;
    authorUserAvatarId: string | null;
    /** The Chat the message is in: a Thread's own Chat, or the Channel or DM. */
    chatId: string;
    content: string;
    /** The Channel or DM the conversation belongs to, never a Thread. */
    conversationChatId: string;
    conversationKind: 'channel' | 'dm';
    conversationName: string | null;
    /** The DM's human members; empty outside a DM. */
    dmMemberUserIds: string[];
    messageId: string;
}

/**
 * Reads a new message for push, or null when it no longer exists or its
 * Chat — or the Channel or DM above its Thread — is archived or deleted.
 */
export async function readPushMessage(
    db: Pick<HausDatabase, 'execute'>,
    input: { chatId: string; messageId: string; serverId: string }
): Promise<PushMessage | null> {
    const rows = (await db.execute(sql`
        select
            chat.anchor_message_id as "anchorMessageId",
            agent.avatar_id as "authorAgentAvatarId",
            agent.display_name as "authorAgentDisplayName",
            message.author_agent_id as "authorAgentId",
            author.avatar_id as "authorUserAvatarId",
            author.display_name as "authorUserDisplayName",
            message.author_user_id as "authorUserId",
            message.chat_id as "chatId",
            message.content,
            coalesce(parent.id, chat.id) as "conversationChatId",
            coalesce(parent.kind, chat.kind) as "conversationKind",
            coalesce(parent.name, chat.name) as "conversationName",
            array_remove(
                array[
                    coalesce(parent.dm_member_one_user_id, chat.dm_member_one_user_id),
                    coalesce(parent.dm_member_two_user_id, chat.dm_member_two_user_id)
                ],
                null
            )::text[] as "dmMemberUserIds",
            message.id as "messageId"
        from chat_messages message
        join chats chat on chat.server_id = message.server_id and chat.id = message.chat_id
        left join chats parent
            on parent.server_id = chat.server_id and parent.id = chat.parent_chat_id
        left join agents agent
            on agent.server_id = message.server_id and agent.id = message.author_agent_id
        left join users author on author.id = message.author_user_id
        where message.server_id = ${input.serverId}
            and message.chat_id = ${input.chatId}
            and message.id = ${input.messageId}
            and chat.deleted_at is null
            and chat.archived_at is null
            and (parent.id is null or (parent.deleted_at is null and parent.archived_at is null))
    `)) as PushMessage[];
    return rows[0] ?? null;
}
