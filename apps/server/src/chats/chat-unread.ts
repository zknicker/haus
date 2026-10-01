import { type SQL, sql } from 'drizzle-orm';
import { chatsTable } from '../postgres/schema.ts';
import { visibleChats } from './chat-visibility.ts';

export type ChatListArchive = 'active' | 'all' | 'archived';

/**
 * The Chats `chat.list` shows a human, as a predicate over `chats`: their
 * visible, undeleted Channels and DMs, minus Threads, a retired Agent's DM, and
 * the onboarding Channel until onboarding completes. `chat.list` and the
 * unread-Chat count both filter with it, so they always agree on the set.
 */
export function listedChats(userId: string, archive: ChatListArchive): SQL {
    return sql`(
        ${chatsTable.kind} <> 'thread'
        and ${chatsTable.deletedAt} is null
        ${archiveFilter(archive)}
        and exists (
            select 1
            from server_onboarding onboarding
            where onboarding.server_id = ${chatsTable.serverId}
                and (
                    ${chatsTable.id} <> onboarding.channel_id
                    or onboarding.phase = 'complete'
                )
        )
        and (
            ${chatsTable.kind} <> 'dm'
            or ${chatsTable.dmAgentId} is null
            or not exists (
                select 1
                from agents peer_agent
                where peer_agent.server_id = ${chatsTable.serverId}
                    and peer_agent.id = ${chatsTable.dmAgentId}
                    and peer_agent.retired_at is not null
            )
        )
        and ${visibleChats(userId)}
    )`;
}

/**
 * A listed Chat's `unreadCount` for `userId`: its own messages past the
 * reader's marker that someone else wrote, plus the Thread replies it rolls up
 * — unread replies in a Thread the reader follows or that mention them
 * (ADR 0038). Mentions read `chat_messages.mentioned_user_ids`, the column
 * every send path fills from the same parse, so nothing loads message bodies.
 */
export function chatUnreadCount(userId: string): SQL<number> {
    return sql<number>`(
        (
            select count(*)::integer
            from chat_messages message
            where message.server_id = ${chatsTable.serverId}
                and message.chat_id = ${chatsTable.id}
                and (message.author_user_id is null or message.author_user_id <> ${userId})
                and message.sequence > coalesce(
                    (
                        select read.sequence
                        from chat_reads read
                        where read.server_id = ${chatsTable.serverId}
                            and read.chat_id = ${chatsTable.id}
                            and read.reader_user_id = ${userId}
                    ),
                    0
                )
        )
        + (
            select count(*)::integer
            from chats thread
            join chat_messages reply
                on reply.server_id = thread.server_id and reply.chat_id = thread.id
            left join chat_reads thread_read
                on thread_read.server_id = thread.server_id
                and thread_read.chat_id = thread.id
                and thread_read.reader_user_id = ${userId}
            left join thread_follows follow
                on follow.server_id = thread.server_id
                and follow.thread_chat_id = thread.id
                and follow.user_id = ${userId}
            where thread.server_id = ${chatsTable.serverId}
                and thread.parent_chat_id = ${chatsTable.id}
                and thread.kind = 'thread'
                and (reply.author_user_id is null or reply.author_user_id <> ${userId})
                and reply.sequence > coalesce(thread_read.sequence, 0)
                and (
                    follow.followed is true
                    or reply.mentioned_user_ids @> array[${userId}]::text[]
                )
        )
    )`;
}

function archiveFilter(archive: ChatListArchive): SQL {
    if (archive === 'active') {
        return sql`and ${chatsTable.archivedAt} is null`;
    }
    if (archive === 'archived') {
        return sql`and ${chatsTable.archivedAt} is not null`;
    }
    return sql``;
}
