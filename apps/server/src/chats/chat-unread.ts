import { type SQL, sql } from 'drizzle-orm';
import { chatsTable } from '../postgres/schema.ts';
import { visibleChats } from './chat-visibility.ts';

export type ChatListArchive = 'active' | 'all' | 'archived';

export function listedChats(userId: string, archive: ChatListArchive): SQL {
    return sql`(
        ${chatsTable.kind} in ('channel', 'dm', 'captain')
        and ${chatsTable.deletedAt} is null
        ${archiveFilter(archive)}
        and (
            ${chatsTable.kind} <> 'captain'
            or not exists (
                select 1
                from agents captain
                where captain.server_id = ${chatsTable.serverId}
                    and captain.id = ${chatsTable.captainAgentId}
                    and captain.retired_at is not null
            )
        )
        and ${visibleChats(userId)}
    )`;
}

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
            and ${captainChatSubscribed(userId)}
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

/** A Captain chat is unread only for its subscribed members (ADR 0062). */
function captainChatSubscribed(userId: string): SQL {
    return sql`(
        ${chatsTable.kind} <> 'captain'
        or exists (
            select 1
            from captain_chat_members captain_member
            where captain_member.server_id = ${chatsTable.serverId}
                and captain_member.chat_id = ${chatsTable.id}
                and captain_member.user_id = ${userId}
                and captain_member.subscribed
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
