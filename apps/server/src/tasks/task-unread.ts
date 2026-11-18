import { type SQL, sql } from 'drizzle-orm';
import { listedChats } from '../chats/chat-unread.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';

/**
 * Task unread state, as SQL correlated against a Task's `chats` row. A Task is
 * unread only for its followers (ADR 0053 decision 9): a message counts for
 * `userId` when someone else wrote it, it sits past their read marker in the
 * Task, and they follow the Task or the message @mentions them. Mentions read
 * `chat_messages.mentioned_user_ids`, filled on every send path.
 */
export function taskUnreadCount(userId: string): SQL<number> {
    return sql<number>`(select count(*)::integer ${countedMessages(userId)})`;
}

/**
 * The Task's newest `limit` counted message ids for `userId`, newest first:
 * the messages `taskUnreadCount` counts, as the Inbox card renders them.
 */
export function taskNewestCountedMessageIds(userId: string, limit: number): SQL<string[]> {
    return sql<string[]>`array(
        select reply.id ${countedMessages(userId)} order by reply.sequence desc limit ${limit}
    )`;
}

/**
 * Whether the `chat_messages` row in scope is a counted message for `userId`:
 * the same rule as `taskUnreadCount`, so a Task row's preview names a message
 * its count includes, never the viewer's own.
 */
export function taskCountedMessage(userId: string): SQL {
    return sql`exists (
        select 1 ${countedMessages(userId)} and reply.id = ${chatMessagesTable.id}
    )`;
}

/**
 * The Task Chats the Inbox lists for `userId`: undeleted Task Chats with a
 * counted message, under a Channel `chat.list` lists for them (visible,
 * undeleted, unarchived). The inner `chats` scope shadows the outer Task row
 * on purpose: `listedChats` is written against `chats`, so inside the subquery
 * it reads the origin Channel.
 */
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
