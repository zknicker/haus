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
 * reader's marker that someone else wrote. Thread replies live in the Thread's
 * own Chat row and count there (`threads/thread-unread.ts`, ADR 0043), never
 * on the parent.
 */
export function chatUnreadCount(userId: string): SQL<number> {
    return sql<number>`(select count(*)::integer ${unreadMessages(userId)})`;
}

/**
 * A listed Chat's newest `limit` unread message ids for `userId`, newest first:
 * the messages `chatUnreadCount` counts, as the Inbox card renders them.
 */
export function chatNewestUnreadMessageIds(userId: string, limit: number): SQL<string[]> {
    return sql<string[]>`array(
        select message.id ${unreadMessages(userId)} order by message.sequence desc limit ${limit}
    )`;
}

function unreadMessages(userId: string): SQL {
    return sql`
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
    `;
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
