import { sql } from 'drizzle-orm';
import { personName } from '../year-scope.ts';
import type { MessageColumns } from './message-columns.ts';

type RoomFact =
    | 'closest-dm'
    | 'conversations-started'
    | 'full-house'
    | 'longest-conversation'
    | 'loudest-channel'
    | 'quickest-reply';

/**
 * Where the member wrote and whom they answered, read from the pass's `mine`
 * CTE. Every room in `mine` is already readable and live.
 */
export const roomColumns: MessageColumns<RoomFact> = {
    'loudest-channel': (scope) => sql`(
        select json_build_object('name', '#' || room.name, 'count', count(*)::int)
        from mine
        join chats room on room.server_id = ${scope.serverId} and room.id = mine.room_id
        where room.kind = 'channel'
        group by room.id, room.name
        order by count(*) desc, room.name asc
        limit 1
    )`,
    // The channel the member wrote in with the largest roster of people and
    // Agents. A room of one is not a full house.
    'full-house': (scope) => sql`(
        select json_build_object('name', name, 'count', count)
        from (
            select
                '#' || room.name as name,
                (
                    (select count(*) from channel_participants person
                     where person.server_id = room.server_id and person.chat_id = room.id)
                    + (select count(*) from agents agent
                       where agent.server_id = room.server_id
                         and agent.home_project_id = room.id
                         and agent.retired_at is null)
                )::int as count
            from (select distinct room_id from mine) rooms
            join chats room on room.server_id = ${scope.serverId} and room.id = rooms.room_id
            where room.kind = 'channel'
        ) rosters
        where count > 1
        order by count desc, name asc
        limit 1
    )`,
    // The DM, human or Agent, the member wrote in most, named by the other side.
    'closest-dm': (scope) => {
        const peer = sql`case
            when room.dm_member_one_user_id = ${scope.userId} then room.dm_member_two_user_id
            else room.dm_member_one_user_id
        end`;
        return sql`(
            select json_build_object('name', name, 'count', count)
            from (
                select
                    coalesce(agent.display_name, ${personName(peer, scope)}) as name,
                    count(*)::int as count
                from mine
                join chats room
                    on room.server_id = ${scope.serverId}
                    and room.id = mine.room_id
                    and room.kind in ('dm', 'captain')
                left join agents agent
                    on agent.server_id = room.server_id and agent.id = room.captain_agent_id
                group by room.id, agent.display_name
            ) dms
            where name is not null
            order by count desc, name asc
            limit 1
        )`;
    },
    'longest-conversation': (scope) => sql`(
        select json_build_object('replies', replies, 'room', room)
        from (
            select
                count(reply.id)::int as replies,
                case when room.kind = 'channel' then '#' || room.name end as room
            from (select distinct chat_id, conversation_id from mine) conversations
            join chats room
                on room.server_id = ${scope.serverId} and room.id = conversations.chat_id
            join chat_messages reply
                on reply.server_id = ${scope.serverId}
                and reply.chat_id = conversations.chat_id
                and reply.reply_root_message_id = conversations.conversation_id
            group by conversations.chat_id, conversations.conversation_id, room.kind, room.name
        ) candidates
        order by replies desc, room asc nulls last
        limit 1
    )`,
    'conversations-started': (scope) => sql`(
        select json_build_object('count', count(*)::int)
        from mine
        where mine.conversation_id = mine.id
          and exists (
              select 1
              from chat_messages reply
              where reply.server_id = ${scope.serverId}
                and reply.chat_id = mine.chat_id
                and reply.reply_root_message_id = mine.id
                and reply.author_user_id is distinct from ${scope.userId}
          )
        having count(*) > 0
    )`,
    // The member's message right after someone else's in the same Chat.
    // Sub-second gaps are simultaneous sends, not replies.
    'quickest-reply': (scope) => sql`(
        select json_build_object('name', name, 'seconds', seconds)
        from (
            select
                coalesce(agent.display_name, person.display_name, membership.handle) as name,
                round(extract(epoch from mine.created_at - previous.created_at))::int as seconds
            from mine
            join chat_messages previous
                on previous.server_id = ${scope.serverId}
                and previous.chat_id = mine.chat_id
                and previous.sequence = mine.sequence - 1
            left join agents agent
                on agent.server_id = previous.server_id and agent.id = previous.author_agent_id
            left join users person on person.id = previous.author_user_id
            left join server_memberships membership
                on membership.server_id = previous.server_id
                and membership.user_id = previous.author_user_id
            where previous.author_user_id is distinct from ${scope.userId}
              and mine.created_at - previous.created_at >= interval '1 second'
        ) replies
        where name is not null
        order by seconds asc, name asc
        limit 1
    )`,
};

export const recapCountsColumn = sql`(
    select json_build_object(
        'chats', count(distinct room_id)::int,
        'conversations', (count(distinct conversation_id) filter (
            where conversation_id <> id
        ))::int
    )
    from mine
)`;
