import type { NeedsYouReason } from '@haus/api';
import { sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';

/** One Chat holding addressing Messages the viewer has not answered or marked Done. */
export interface NeedsYouChatRow {
    addressedCount: number;
    anchorMessageId: string | null;
    authorAgentAvatarId: string | null;
    authorAgentDescription: string | null;
    authorAgentDisplayName: string | null;
    authorAgentId: string | null;
    authorAgentRetiredAt: Date | null;
    authorUserAvatarId: string | null;
    authorUserDescription: string | null;
    authorUserDisplayName: string | null;
    authorUserId: string | null;
    authorUserRevokedAt: Date | null;
    chatId: string;
    content: string;
    conversationChatId: string;
    conversationKind: 'channel' | 'dm';
    conversationName: string | null;
    createdAt: Date;
    dmAgentId: string | null;
    messageId: string;
    peerUserId: string | null;
    /** Why the newest addressing Message addresses the viewer. */
    reason: NeedsYouReason;
    sequence: number;
}

/**
 * Reads every Needs you Chat for one human in one statement (ADR 0037).
 *
 * An addressing Message is one from someone else that is either in a DM (or a
 * DM Thread) the viewer belongs to, or a Channel/Thread Message whose
 * `mentioned_user_ids` holds the viewer, that inline-replies to a Message
 * the viewer wrote, or that sits in a Thread anchored on a Message the viewer
 * wrote. It is answered when the viewer later
 * wrote in the same DM or Thread, inline-replied in the same exchange, wrote
 * in the same Chat a Message that mentions its author (a reply that reaches
 * the author), or wrote in the Thread anchored on it; and it is done at or below the viewer's
 * `chat_reads.done_sequence`. DM Chats and Threads on the viewer's Messages
 * are bounded by the viewer's own last Message there; mentions come off the GIN index and inline replies off the partial
 * reply index above Done, so no side scans history.
 */
export async function readNeedsYouChats(
    db: Pick<HausDatabase, 'execute'>,
    input: { serverId: string; viewerUserId: string }
): Promise<NeedsYouChatRow[]> {
    const { serverId, viewerUserId: viewer } = input;
    const rows = await db.execute(sql`
        with viewer_chats as (
            select
                chats.id as chat_id,
                chats.kind,
                chats.anchor_message_id,
                coalesce(parent.id, chats.id) as conversation_chat_id,
                coalesce(parent.kind, chats.kind) as conversation_kind,
                coalesce(parent.name, chats.name) as conversation_name,
                coalesce(parent.dm_agent_id, chats.dm_agent_id) as dm_agent_id,
                case
                    when coalesce(parent.dm_agent_id, chats.dm_agent_id) is not null then null
                    when coalesce(parent.dm_member_one_user_id, chats.dm_member_one_user_id) = ${viewer}
                    then coalesce(parent.dm_member_two_user_id, chats.dm_member_two_user_id)
                    else coalesce(parent.dm_member_one_user_id, chats.dm_member_one_user_id)
                end as peer_user_id,
                coalesce(reads.done_sequence, 0) as done_sequence
            from chats
            left join chats parent
                on parent.server_id = chats.server_id and parent.id = chats.parent_chat_id
            left join chat_reads reads
                on reads.server_id = chats.server_id
                and reads.chat_id = chats.id
                and reads.reader_user_id = ${viewer}
            where chats.server_id = ${serverId}
                and chats.deleted_at is null
                and chats.archived_at is null
                and (parent.id is null or (parent.deleted_at is null and parent.archived_at is null))
                and chats.last_message_sequence > coalesce(reads.done_sequence, 0)
                and ${visibleChats(viewer)}
        ),
        dm_addressing as (
            select vc.chat_id, message.id, message.sequence, 'dm' as reason
            from viewer_chats vc
            cross join lateral (
                select coalesce(max(own.sequence), 0) as sequence
                from chat_messages own
                where own.server_id = ${serverId}
                    and own.chat_id = vc.chat_id
                    and own.author_user_id = ${viewer}
            ) own
            join chat_messages message
                on message.server_id = ${serverId}
                and message.chat_id = vc.chat_id
                and message.sequence > greatest(vc.done_sequence, own.sequence)
            where vc.conversation_kind = 'dm'
                and message.author_user_id is distinct from ${viewer}
        ),
        -- Channel candidates: a mention of the viewer (GIN), an inline reply
        -- to a Message the viewer wrote, found among the Chat's replies since
        -- Done (partial reply index) and checked against the parent's author,
        -- or any Message in a Thread anchored on the viewer's Message since
        -- their own last Message there (a Thread answer is a reply too).
        channel_candidates as (
            select message.chat_id, message.id
            from chat_messages message
            join viewer_chats vc on vc.chat_id = message.chat_id
            where message.server_id = ${serverId}
                and message.mentioned_user_ids @> array[${viewer}]::text[]
                and vc.conversation_kind = 'channel'
                and message.sequence > vc.done_sequence
            union
            select message.chat_id, message.id
            from viewer_chats vc
            join chat_messages message
                on message.server_id = ${serverId}
                and message.chat_id = vc.chat_id
                and message.sequence > vc.done_sequence
                and message.reply_to_message_id is not null
            join chat_messages parent
                on parent.server_id = ${serverId}
                and parent.chat_id = message.chat_id
                and parent.id = message.reply_to_message_id
            where vc.conversation_kind = 'channel'
                and parent.author_user_id = ${viewer}
            union
            select message.chat_id, message.id
            from viewer_chats vc
            join chat_messages anchor
                on anchor.server_id = ${serverId}
                and anchor.chat_id = vc.conversation_chat_id
                and anchor.id = vc.anchor_message_id
            cross join lateral (
                select coalesce(max(own.sequence), 0) as sequence
                from chat_messages own
                where own.server_id = ${serverId}
                    and own.chat_id = vc.chat_id
                    and own.author_user_id = ${viewer}
            ) own
            join chat_messages message
                on message.server_id = ${serverId}
                and message.chat_id = vc.chat_id
                and message.sequence > greatest(vc.done_sequence, own.sequence)
            where vc.conversation_kind = 'channel'
                and vc.kind = 'thread'
                and anchor.author_user_id = ${viewer}
                and message.author_user_id is distinct from ${viewer}
        ),
        channel_addressing as (
            select
                vc.chat_id,
                message.id,
                message.sequence,
                case
                    when message.mentioned_user_ids @> array[${viewer}]::text[] then 'mention'
                    else 'reply'
                end as reason
            from channel_candidates candidate
            join viewer_chats vc on vc.chat_id = candidate.chat_id
            join chat_messages message
                on message.server_id = ${serverId}
                and message.chat_id = candidate.chat_id
                and message.id = candidate.id
            where message.author_user_id is distinct from ${viewer}
                and not exists (
                    select 1 from chat_messages answer
                    where answer.server_id = ${serverId}
                        and answer.chat_id = message.chat_id
                        and answer.author_user_id = ${viewer}
                        and answer.sequence > message.sequence
                        and (
                            vc.kind = 'thread'
                            or coalesce(answer.reply_root_message_id, answer.id)
                                = coalesce(message.reply_root_message_id, message.id)
                            or answer.mentioned_user_ids @> array[message.author_user_id]::text[]
                            or (
                                message.author_agent_id is not null
                                and answer.content ~ ('\\(\\s*agent://' || message.author_agent_id || '\\s*\\)')
                            )
                        )
                )
        ),
        addressing as (
            select candidate.chat_id, candidate.id, candidate.sequence, candidate.reason
            from (
                select * from dm_addressing
                union all
                select * from channel_addressing
            ) candidate
            where not exists (
                select 1
                from chats thread
                join chat_messages answer
                    on answer.server_id = thread.server_id
                    and answer.chat_id = thread.id
                    and answer.author_user_id = ${viewer}
                where thread.server_id = ${serverId}
                    and thread.kind = 'thread'
                    and thread.parent_chat_id = candidate.chat_id
                    and thread.anchor_message_id = candidate.id
            )
        ),
        grouped as (
            select
                chat_id,
                count(*)::int as addressed_count,
                max(sequence) as sequence,
                (array_agg(reason order by sequence desc))[1] as reason
            from addressing
            group by chat_id
        )
        select
            grouped.addressed_count as "addressedCount",
            vc.anchor_message_id as "anchorMessageId",
            agent.avatar_id as "authorAgentAvatarId",
            agent.description as "authorAgentDescription",
            agent.display_name as "authorAgentDisplayName",
            latest.author_agent_id as "authorAgentId",
            agent.retired_at as "authorAgentRetiredAt",
            author.avatar_id as "authorUserAvatarId",
            author.description as "authorUserDescription",
            author.display_name as "authorUserDisplayName",
            latest.author_user_id as "authorUserId",
            membership.revoked_at as "authorUserRevokedAt",
            grouped.chat_id as "chatId",
            latest.content,
            vc.conversation_chat_id as "conversationChatId",
            vc.conversation_kind as "conversationKind",
            vc.conversation_name as "conversationName",
            latest.created_at as "createdAt",
            vc.dm_agent_id as "dmAgentId",
            latest.id as "messageId",
            vc.peer_user_id as "peerUserId",
            grouped.reason,
            latest.sequence
        from grouped
        join viewer_chats vc on vc.chat_id = grouped.chat_id
        join chat_messages latest
            on latest.server_id = ${serverId}
            and latest.chat_id = grouped.chat_id
            and latest.sequence = grouped.sequence
        left join agents agent
            on agent.server_id = latest.server_id and agent.id = latest.author_agent_id
        left join users author on author.id = latest.author_user_id
        left join server_memberships membership
            on membership.server_id = latest.server_id
            and membership.user_id = latest.author_user_id
        order by latest.created_at desc, grouped.chat_id
    `);
    return rows as NeedsYouChatRow[];
}
