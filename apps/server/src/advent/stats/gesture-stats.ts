import { sql } from 'drizzle-orm';
import type { AdventFactStats } from '../fact-stats.ts';
import { type AdventScope, inYear, readableChat } from '../year-scope.ts';
import { type AdventReader, readCount, readRow } from './read-row.ts';

/**
 * What the member did besides writing: files, reactions, tasks, new channels,
 * and being mentioned. Each is one query over its own table, limited to Chats
 * the member can read.
 */

/** Files the member attached to a sent message. */
export async function readFilesShared(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['files-shared'] | null> {
    return await readCount(
        db,
        sql`
            select count(*)::int as count
            from attachments attachment
            join chats chat on chat.server_id = attachment.server_id and chat.id = attachment.chat_id
            where attachment.server_id = ${scope.serverId}
              and attachment.uploader_user_id = ${scope.userId}
              and attachment.message_id is not null
              and attachment.state = 'ready'
              and ${inYear(scope, sql`attachment.created_at`)}
              and ${readableChat(scope, 'chat')}
        `
    );
}

export async function readFavoriteReaction(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['favorite-reaction'] | null> {
    return await readRow(
        db,
        sql`
            select reaction.emoji, count(*)::int as count
            from message_reactions reaction
            join chat_messages message
                on message.server_id = reaction.server_id and message.id = reaction.message_id
            join chats chat on chat.server_id = message.server_id and chat.id = message.chat_id
            where reaction.server_id = ${scope.serverId}
              and reaction.actor_user_id = ${scope.userId}
              and ${inYear(scope, sql`reaction.created_at`)}
              and ${readableChat(scope, 'chat')}
            group by reaction.emoji
            order by count desc, reaction.emoji asc
            limit 1
        `
    );
}

/**
 * Messages by anyone else that mention the member, in Chats the member can
 * read: a mention inside another pair's DM is not theirs to count.
 */
export async function readInDemand(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['in-demand'] | null> {
    return await readCount(
        db,
        sql`
            select count(*)::int as count
            from chat_messages message
            join chats chat on chat.server_id = message.server_id and chat.id = message.chat_id
            where message.server_id = ${scope.serverId}
              and message.mentioned_user_ids @> array[${scope.userId}::text]
              and message.author_user_id is distinct from ${scope.userId}
              and ${inYear(scope, sql`message.created_at`)}
              and ${readableChat(scope, 'chat')}
        `
    );
}

/**
 * Tasks the member created that reached `done` or `closed` this year. Tasks are
 * Agent work (ADR 0037), so no human is ever the assignee; `updated_at` is the
 * closest durable stamp of the close.
 */
export async function readTasksClosed(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['tasks-closed'] | null> {
    return await readCount(
        db,
        sql`
            select count(*)::int as count
            from message_claims task
            join chats chat on chat.server_id = task.server_id and chat.id = task.chat_id
            where task.server_id = ${scope.serverId}
              and task.created_by_user_id = ${scope.userId}
              and task.status in ('done', 'closed')
              and ${inYear(scope, sql`task.updated_at`)}
              and ${readableChat(scope, 'chat')}
        `
    );
}

/**
 * Channels the member created this year. Channel creation enrolls the creator
 * in the same transaction, so their participant row shares the Chat's
 * `created_at`; no other row can.
 */
export async function readNewChannels(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['new-channels'] | null> {
    const row = await readRow<{ count: number; latest: string | null }>(
        db,
        sql`
            select
                count(*)::int as count,
                (array_agg('#' || chat.name order by chat.created_at desc))[1] as latest
            from chats chat
            join channel_participants creator
                on creator.server_id = chat.server_id
                and creator.chat_id = chat.id
                and creator.user_id = ${scope.userId}
                and creator.created_at = chat.created_at
            where chat.server_id = ${scope.serverId}
              and chat.kind = 'channel'
              and not chat.is_all
              and chat.deleted_at is null
              and ${inYear(scope, sql`chat.created_at`)}
        `
    );
    return row && row.count > 0 && row.latest ? { count: row.count, latest: row.latest } : null;
}
