import { type SQL, sql } from 'drizzle-orm';
import { listedChats } from '../chats/chat-unread.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';

/**
 * Thread unread state, as SQL correlated against a Thread's `chats` row.
 * A Thread is unread on its own, never through its parent (ADR 0043): a reply
 * counts for `userId` when someone else wrote it, it sits past their Thread
 * read marker, and they follow the Thread or the reply @mentions them.
 * Mentions read `chat_messages.mentioned_user_ids`, filled on every send path.
 */
export function threadUnreadCount(userId: string): SQL<number> {
    return sql<number>`(select count(*)::integer ${countedReplies(userId)})`;
}

/** The oldest counted reply's id, where opening the Thread lands; null when none. */
export function threadFirstUnreadMessageId(userId: string): SQL<string | null> {
    return sql<string | null>`(
        select reply.id ${countedReplies(userId)} order by reply.sequence limit 1
    )`;
}

/** The oldest counted reply's sequence; null when none. */
export function threadFirstUnreadSequence(userId: string): SQL<number | null> {
    return sql<number | null>`(select min(reply.sequence) ${countedReplies(userId)})`;
}

/**
 * The Thread's newest `limit` counted reply ids for `userId`, newest first:
 * the replies `threadUnreadCount` counts, as the Inbox card renders them.
 */
export function threadNewestCountedReplyIds(userId: string, limit: number): SQL<string[]> {
    return sql<string[]>`array(
        select reply.id ${countedReplies(userId)} order by reply.sequence desc limit ${limit}
    )`;
}

/**
 * Whether the `chat_messages` row in scope is a counted reply for `userId`:
 * the same rule as `threadUnreadCount`, so a Thread row's preview names a
 * reply its count includes, never the viewer's own.
 */
export function threadCountedReply(userId: string): SQL {
    return sql`exists (
        select 1 ${countedReplies(userId)} and reply.id = ${chatMessagesTable.id}
    )`;
}

/**
 * The Threads the Inbox lists for `userId`: undeleted Threads with a counted
 * reply, under a Channel or DM `chat.list` lists for them (visible, undeleted,
 * unarchived). The parent scope is `listedChats` itself, so a Thread row always
 * has its parent row to name it, and the badge never counts a Thread under a
 * Chat the Inbox cannot show. The inner `chats` scope shadows the outer
 * Thread row on purpose: `listedChats` is written against `chats`, so inside
 * the subquery it reads the parent.
 */
export function unreadThreads(userId: string): SQL {
    return sql`(
        ${chatsTable.kind} = 'thread'
        and ${chatsTable.deletedAt} is null
        and (${chatsTable.serverId}, ${chatsTable.parentChatId}) in (
            select "chats"."server_id", "chats"."id"
            from "chats"
            where ${listedChats(userId, 'active')}
        )
        and ${threadUnreadCount(userId)} > 0
    )`;
}

function countedReplies(userId: string): SQL {
    return sql`
        from chat_messages reply
        left join chat_reads thread_read
            on thread_read.server_id = reply.server_id
            and thread_read.chat_id = reply.chat_id
            and thread_read.reader_user_id = ${userId}
        left join thread_follows follow
            on follow.server_id = reply.server_id
            and follow.thread_chat_id = reply.chat_id
            and follow.user_id = ${userId}
        where reply.server_id = ${chatsTable.serverId}
            and reply.chat_id = ${chatsTable.id}
            and (reply.author_user_id is null or reply.author_user_id <> ${userId})
            and reply.sequence > coalesce(thread_read.sequence, 0)
            and (
                follow.followed is true
                or reply.mentioned_user_ids @> array[${userId}]::text[]
            )
    `;
}
