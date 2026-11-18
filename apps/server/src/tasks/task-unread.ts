import { type SQL, sql } from 'drizzle-orm';
import { listedChats } from '../chats/chat-unread.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';

export function taskUnreadCount(userId: string): SQL<number> {
    return sql<number>`(select count(*)::integer ${countedMessages(userId)})`;
}

export function taskNewestCountedMessageIds(userId: string, limit: number): SQL<string[]> {
    return sql<string[]>`array(
        select reply.id ${countedMessages(userId)} order by reply.sequence desc limit ${limit}
    )`;
}

export function taskCountedMessage(userId: string): SQL {
    return sql`exists (
        select 1 ${countedMessages(userId)} and reply.id = ${chatMessagesTable.id}
    )`;
}

export function unreadTasks(userId: string): SQL {
    return sql`(
        ${chatsTable.kind} = 'task'
        and ${chatsTable.deletedAt} is null
        and (${chatsTable.serverId}, ${chatsTable.parentChatId}) in (
            select "chats"."server_id", "chats"."id"
            from "chats"
            where ${listedChats(userId, 'active')}
        )
        and ${taskUnreadCount(userId)} > 0
    )`;
}

function countedMessages(userId: string): SQL {
    return sql`
        from chat_messages reply
        left join chat_reads task_read
            on task_read.server_id = reply.server_id
            and task_read.chat_id = reply.chat_id
            and task_read.reader_user_id = ${userId}
        left join task_follows follow
            on follow.server_id = reply.server_id
            and follow.task_chat_id = reply.chat_id
            and follow.user_id = ${userId}
        where reply.server_id = ${chatsTable.serverId}
            and reply.chat_id = ${chatsTable.id}
            and (reply.author_user_id is null or reply.author_user_id <> ${userId})
            and reply.sequence > coalesce(task_read.sequence, 0)
            and (
                follow.followed is true
                or reply.mentioned_user_ids @> array[${userId}]::text[]
            )
    `;
}
