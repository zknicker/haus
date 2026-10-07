import type {
    AgentInboxConversation,
    AgentInboxConversationsResponse,
    AgentInboxView,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { visibleChatSql } from './message-view.ts';

export interface InboxConversationsQuery {
    before: number | null;
    limit: number;
    view: AgentInboxView;
}

/**
 * `haus inbox check` (Raft's `listAgentInbox`): every conversation the Agent
 * belongs to — joined channels, its DMs, followed Threads as their own rows —
 * with someone else's message past its read position. A muted channel counts
 * only mentions and appears only while it has one: a mention pierces mute.
 * One statement, so the list, its paging, and its totals share one snapshot.
 */
export async function listAgentInboxConversations(
    db: Pick<HausDatabase, 'execute'>,
    runner: ResolvedRunner,
    query: InboxConversationsQuery
): Promise<AgentInboxConversationsResponse> {
    const rows = (await db.execute(conversationsSql(runner))) as ConversationRow[];
    const all = rows.map(toConversation).sort((a, b) => b.activityKey - a.activityKey);
    const inView = all.filter(
        (row) =>
            (query.view === 'unread' || row.mentions > 0) &&
            (query.before === null || row.activityKey < query.before)
    );
    const items = inView.slice(0, query.limit);
    const hasMore = inView.length > query.limit;
    return {
        hasMore,
        items,
        nextBefore: hasMore ? (items.at(-1)?.activityKey ?? null) : null,
        totals: {
            conversations: all.length,
            dms: all.filter((row) => row.kind === 'dm').length,
            mentions: all.filter((row) => row.mentions > 0).length,
        },
        view: query.view,
    };
}

interface ConversationRow {
    activityKey: string | null;
    chatId: string;
    kind: AgentInboxConversation['kind'];
    lastReadSequence: number;
    latestAt: Date | string | null;
    latestSenderHandle: string | null;
    mentions: number;
    muted: boolean;
    target: string;
    unread: number;
}

/** A row without its newest message's created event cannot be ordered truthfully. */
function toConversation(row: ConversationRow): AgentInboxConversation {
    const activityKey = Number(row.activityKey);
    if (!(Number.isSafeInteger(activityKey) && activityKey > 0)) {
        throw new Error(`Inbox conversation ${row.chatId} has no message event cursor.`);
    }
    return {
        activityKey,
        chatId: row.chatId,
        kind: row.kind,
        lastReadSequence: row.lastReadSequence,
        latestAt: row.latestAt === null ? null : new Date(row.latestAt).toISOString(),
        latestSenderHandle: row.latestSenderHandle,
        mentions: row.mentions,
        target: row.target,
        unread: row.muted ? row.mentions : row.unread,
    };
}

/** Exported for the muted-backlog regression test; the list goes through `listAgentInboxConversations`. */
export function conversationsSql(runner: ResolvedRunner) {
    const { agentId, serverId } = runner;
    return sql`
        select
            chats.id as "chatId",
            chats.kind as kind,
            position.sequence as "lastReadSequence",
            (mute.agent_id is not null) as muted,
            counts.unread as unread,
            counts.mentions as mentions,
            latest.created_at as "latestAt",
            coalesce(latest_agent.handle, latest_human.handle) as "latestSenderHandle",
            activity.cursor::text as "activityKey",
            case
                when chats.kind = 'channel' then '#' || chats.name
                when chats.kind = 'dm' then 'dm:@' || dm_human.handle
                else
                    case when parent.kind = 'channel' then '#' || parent.name
                        else 'dm:@' || dm_human.handle end
                    || ':'
                    || case when left(chats.anchor_message_id, 4) = 'msg_'
                        then substr(chats.anchor_message_id, 5, 8)
                        else chats.anchor_message_id end
            end as target
        from chats
        left join chats parent
            on parent.server_id = chats.server_id and parent.id = chats.parent_chat_id
        left join server_memberships dm_human
            on dm_human.server_id = chats.server_id
            and dm_human.revoked_at is null
            and dm_human.user_id = case
                when chats.kind = 'dm' then chats.dm_member_one_user_id
                when parent.kind = 'dm' then parent.dm_member_one_user_id
            end
        left join agent_channel_mutes mute
            on mute.server_id = chats.server_id
            and mute.agent_id = ${agentId}
            and mute.chat_id = chats.id
        cross join lateral (
            select coalesce((
                select read.sequence from agent_chat_reads read
                where read.server_id = chats.server_id
                  and read.agent_id = ${agentId}
                  and read.chat_id = chats.id
            ), 0) as sequence
        ) position
        cross join lateral (
            select
                -- A muted channel lists only by mentions, so never scan its backlog.
                case when mute.agent_id is not null then 0 else (
                    select count(*)::integer from chat_messages unread
                    where unread.server_id = chats.server_id
                      and unread.chat_id = chats.id
                      and unread.sequence > position.sequence
                      and unread.author_agent_id is distinct from ${agentId}
                ) end as unread,
                (
                    select count(*)::integer from agent_inbox item
                    join chat_messages mention
                        on mention.server_id = item.server_id and mention.id = item.dedupe_key
                    where item.server_id = chats.server_id
                      and item.agent_id = ${agentId}
                      and item.chat_id = chats.id
                      and item.mentioned
                      and mention.chat_id = chats.id
                      and mention.sequence > position.sequence
                ) as mentions
        ) counts
        left join lateral (
            select newest.id, newest.created_at, newest.author_agent_id, newest.author_user_id
            from chat_messages newest
            where newest.server_id = chats.server_id and newest.chat_id = chats.id
            order by newest.sequence desc
            limit 1
        ) latest on true
        left join agents latest_agent
            on latest_agent.server_id = chats.server_id and latest_agent.id = latest.author_agent_id
        left join server_memberships latest_human
            on latest_human.server_id = chats.server_id
            and latest_human.user_id = latest.author_user_id
        left join lateral (
            select max(event.cursor) as cursor from chat_events event
            where event.server_id = chats.server_id
              and event.message_id = latest.id
              and event.event_type = 'message.created'
        ) activity on true
        where chats.server_id = ${serverId}
          and chats.deleted_at is null
          and (parent.id is null or parent.deleted_at is null)
          and ${visibleChatSql(runner)}
          and (
              chats.kind <> 'thread'
              or exists (
                  select 1 from agent_thread_follows follow
                  where follow.server_id = chats.server_id
                    and follow.agent_id = ${agentId}
                    and follow.thread_chat_id = chats.id
                    and follow.followed
              )
          )
          and (chats.kind = 'channel' or parent.kind = 'channel' or dm_human.handle is not null)
          and case when mute.agent_id is not null
              then counts.mentions > 0
              else counts.unread > 0 end
    `;
}
