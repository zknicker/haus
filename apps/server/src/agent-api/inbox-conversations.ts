import type {
    AgentInboxConversation,
    AgentInboxConversationsResponse,
    AgentInboxView,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import { taskTargetOfChatSql } from '../agent-delivery/task-target-sql.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    compareInboxActivity,
    encodeInboxActivityKey,
    type InboxActivityPosition,
} from './inbox-activity-key.ts';
import { visibleChatSql } from './message-view.ts';

export interface InboxConversationsQuery {
    /** Rows strictly older than this position; null for the first page. */
    before: InboxActivityPosition | null;
    limit: number;
    view: AgentInboxView;
}

/**
 * `haus inbox check` (Raft's `listAgentInbox`): every conversation that reaches
 * the Agent (specs/inbox.md#hearing) with someone else's message past its read
 * position: its home Project's channel and Tasks, Tasks it follows elsewhere,
 * its DMs, and another channel while what reached the Agent there, a mention or
 * a followed reply chain, is unread. Such a channel counts only those messages.
 * One statement, so the list, its paging, and its totals share one snapshot.
 */
export async function listAgentInboxConversations(
    db: Pick<HausDatabase, 'execute'>,
    runner: ResolvedRunner,
    query: InboxConversationsQuery
): Promise<AgentInboxConversationsResponse> {
    const rows = (await db.execute(conversationsSql(runner))) as ConversationRow[];
    const all = rows.map(toPositioned).sort((a, b) => compareInboxActivity(a.position, b.position));
    const { before } = query;
    const inView = all.filter(
        ({ conversation, position }) =>
            (query.view === 'unread' || conversation.mentions > 0) &&
            (before === null || compareInboxActivity(position, before) > 0)
    );
    const items = inView.slice(0, query.limit).map(({ conversation }) => conversation);
    const hasMore = inView.length > query.limit;
    return {
        hasMore,
        items,
        nextBefore: hasMore ? (items.at(-1)?.activityKey ?? null) : null,
        totals: {
            conversations: all.length,
            dms: all.filter(({ conversation }) => conversation.kind === 'dm').length,
            mentions: all.filter(({ conversation }) => conversation.mentions > 0).length,
        },
        view: query.view,
    };
}

interface ConversationRow {
    activityAt: string | null;
    chatId: string;
    heard: number;
    kind: AgentInboxConversation['kind'];
    lastReadSequence: number;
    latestAt: Date | string | null;
    latestId: string | null;
    latestSenderHandle: string | null;
    mentions: number;
    outside: boolean;
    target: string;
    unread: number;
}

interface PositionedConversation {
    conversation: AgentInboxConversation;
    position: InboxActivityPosition;
}

/** A row is ordered by its newest message; without one it cannot be ordered truthfully. */
function toPositioned(row: ConversationRow): PositionedConversation {
    if (row.activityAt === null || row.latestId === null) {
        throw new Error(`Inbox conversation ${row.chatId} has no newest message.`);
    }
    const position = { createdAt: row.activityAt, id: row.latestId };
    return { conversation: toConversation(row, encodeInboxActivityKey(position)), position };
}

function toConversation(row: ConversationRow, activityKey: string): AgentInboxConversation {
    return {
        activityKey,
        chatId: row.chatId,
        kind: row.kind,
        lastReadSequence: row.lastReadSequence,
        latestAt: row.latestAt === null ? null : new Date(row.latestAt).toISOString(),
        latestSenderHandle: row.latestSenderHandle,
        mentions: row.mentions,
        target: row.target,
        unread: row.outside ? row.heard : row.unread,
    };
}

/** Exported for the outside-channel backlog regression test; the list goes through `listAgentInboxConversations`. */
export function conversationsSql(runner: ResolvedRunner) {
    const { agentId, serverId } = runner;
    return sql`
        select
            chats.id as "chatId",
            chats.kind as kind,
            position.sequence as "lastReadSequence",
            place.outside as outside,
            counts.unread as unread,
            counts.heard as heard,
            counts.mentions as mentions,
            latest.created_at as "latestAt",
            coalesce(latest_agent.handle, latest_human.handle) as "latestSenderHandle",
            to_char(latest.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                as "activityAt",
            latest.id as "latestId",
            case
                when chats.kind = 'channel' then '#' || chats.name
                when chats.kind = 'dm' then 'dm:@' || dm_human.handle
                else ${taskTargetOfChatSql('chats')}
            end as target
        from chats
        join agents me on me.server_id = chats.server_id and me.id = ${agentId}
        left join chats parent
            on parent.server_id = chats.server_id and parent.id = chats.parent_chat_id
        left join server_memberships dm_human
            on dm_human.server_id = chats.server_id
            and dm_human.revoked_at is null
            and chats.kind = 'dm'
            and dm_human.user_id = chats.dm_member_one_user_id
        cross join lateral (
            select chats.kind = 'channel' and chats.id <> me.home_project_id as outside
        ) place
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
                -- A channel outside the home lists only what reached the Agent, so never scan its backlog.
                case when place.outside then 0 else (
                    select count(*)::integer from chat_messages unread
                    where unread.server_id = chats.server_id
                      and unread.chat_id = chats.id
                      and unread.sequence > position.sequence
                      and unread.author_agent_id is distinct from ${agentId}
                ) end as unread,
                (
                    select count(*)::integer from agent_inbox item
                    join chat_messages heard
                        on heard.server_id = item.server_id and heard.id = item.dedupe_key
                    where item.server_id = chats.server_id
                      and item.agent_id = ${agentId}
                      and item.chat_id = chats.id
                      and heard.chat_id = chats.id
                      and heard.sequence > position.sequence
                ) as heard,
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
        where chats.server_id = ${serverId}
          and chats.deleted_at is null
          and (parent.id is null or parent.deleted_at is null)
          and ${visibleChatSql(runner)}
          and (
              -- Reading a Task is open, but this list follows hearing: the home
              -- Project's Tasks, and elsewhere the Tasks the Agent follows.
              chats.kind <> 'task'
              or chats.parent_chat_id = me.home_project_id
              or exists (
                  select 1 from agent_task_follows follow
                  where follow.server_id = chats.server_id
                    and follow.agent_id = ${agentId}
                    and follow.task_chat_id = chats.id
                    and follow.followed
              )
          )
          and (chats.kind = 'channel' or parent.kind = 'channel' or dm_human.handle is not null)
          and case when place.outside then counts.heard > 0 else counts.unread > 0 end
    `;
}
