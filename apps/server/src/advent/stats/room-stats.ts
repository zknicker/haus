import { sql } from 'drizzle-orm';
import { personName } from '../year-scope.ts';
import type { MessageColumns } from './message-columns.ts';

type RoomFact =
    | 'closest-dm'
    | 'full-house'
    | 'longest-thread'
    | 'loudest-channel'
    | 'quickest-reply'
    | 'threads-resolved';

/**
 * Where the member wrote and whom they answered, read from the pass's `mine`
 * CTE. Thread messages count toward their parent (`room_id`). Every room in
 * `mine` is already readable and live.
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
                    + (select count(*) from channel_agent_participants agent
                       where agent.server_id = room.server_id and agent.chat_id = room.id)
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
                    and room.kind = 'dm'
                left join agents agent
                    on agent.server_id = room.server_id and agent.id = room.dm_agent_id
                group by room.id, agent.display_name
            ) dms
            where name is not null
            order by count desc, name asc
            limit 1
        )`;
    },
    'longest-thread': (scope) => sql`(
        select json_build_object('replies', replies, 'room', room)
        from (
            select
                thread.last_message_sequence::int as replies,
                case when parent.kind = 'channel' then '#' || parent.name end as room
            from (select distinct chat_id from mine where kind = 'thread') threads
            join chats thread on thread.server_id = ${scope.serverId} and thread.id = threads.chat_id
            join chats parent
                on parent.server_id = thread.server_id and parent.id = thread.parent_chat_id
        ) candidates
        order by replies desc, room asc nulls last
        limit 1
    )`,
    // Threads whose first message was the member's and that someone else answered.
    'threads-resolved': (scope) => sql`(
        select json_build_object('count', count(*)::int)
        from mine
        where mine.kind = 'thread'
          and mine.sequence = 1
          and exists (
              select 1
              from chat_messages reply
              where reply.server_id = ${scope.serverId}
                and reply.chat_id = mine.chat_id
                and reply.sequence > 1
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

/** Distinct rooms and Threads the member wrote in, for the recap. */
export const recapCountsColumn = sql`(
    select json_build_object(
        'chats', count(distinct room_id)::int,
        'threads', (count(distinct chat_id) filter (where kind = 'thread'))::int
    )
    from mine
)`;
