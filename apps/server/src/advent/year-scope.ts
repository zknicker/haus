import { type SQL, sql } from 'drizzle-orm';

/** One member's calendar year in one Server, bounded and bucketed in their zone. */
export interface AdventScope {
    serverId: string;
    /** A validated IANA zone; every hour, day, and the year's bounds use it. */
    timeZone: string;
    userId: string;
    year: number;
}

/** Local midnight on Jan 1 of the scope year, as an instant. */
export function yearStart(scope: AdventScope): SQL {
    return sql`make_timestamptz(${scope.year}::int, 1, 1, 0, 0, 0, ${scope.timeZone}::text)`;
}

/** Local midnight on Jan 1 of the following year, as an instant. */
export function yearEnd(scope: AdventScope): SQL {
    return sql`make_timestamptz(${scope.year + 1}::int, 1, 1, 0, 0, 0, ${scope.timeZone}::text)`;
}

/** `column` falls inside the scope's local calendar year. */
export function inYear(scope: AdventScope, column: SQL): SQL {
    return sql`${column} >= ${yearStart(scope)} and ${column} < ${yearEnd(scope)}`;
}

/**
 * `chat` (an alias of `chats`) is a live Chat the member can read: any channel,
 * a DM they are a side of, or a Thread under one of those. A Thread whose
 * parent is soft-deleted is gone with it, though its own row is not.
 */
export function readableChat(scope: AdventScope, alias: string): SQL {
    const chat = sql.raw(alias);
    return sql`(
        ${chat}.deleted_at is null
        and (
            ${chat}.kind = 'channel'
            or (${chat}.kind = 'dm' and ${dmSide(scope, chat)})
            or (
                ${chat}.kind = 'thread'
                and exists (
                    select 1
                    from chats parent
                    where parent.server_id = ${chat}.server_id
                      and parent.id = ${chat}.parent_chat_id
                      and parent.deleted_at is null
                      and (parent.kind = 'channel' or (parent.kind = 'dm' and ${dmSide(scope, sql.raw('parent'))}))
                )
            )
        )
    )`;
}

/**
 * The member's own messages this year in Chats they can read, as a CTE body.
 * Each readable Chat is one probe of the existing
 * `chat_messages_author_user_idx` (server, chat, author), so the read grows
 * with the member's Chats and messages rather than every message in the
 * Server, and needs no new index. A calendar request builds it once per pass
 * (see `stats/message-pass.ts`), not once per fact.
 *
 * Columns: `id`, `chat_id`, `sequence`, `created_at`, `local_at` (wall-clock
 * time in the scope zone), `kind`, and `room_id` (a Thread's parent Chat, else
 * the Chat itself). `content` is selected only when a fact must match words in
 * it; it never leaves the query.
 */
export function memberMessages(scope: AdventScope, options: { content?: boolean } = {}): SQL {
    const content = options.content ? sql`, message.content` : sql``;
    return sql`
        select
            message.id,
            message.chat_id,
            message.sequence,
            message.created_at,
            message.created_at at time zone ${scope.timeZone}::text as local_at,
            chat.kind,
            case when chat.kind = 'thread' then chat.parent_chat_id else chat.id end as room_id
            ${content}
        from chats chat
        cross join lateral (
            select m.id, m.chat_id, m.sequence, m.created_at, m.content
            from chat_messages m
            where m.server_id = chat.server_id
              and m.chat_id = chat.id
              and m.author_user_id = ${scope.userId}
              and ${inYear(scope, sql`m.created_at`)}
            -- A fence: without it the planner flattens the lateral into a hash
            -- join over a scan of every message in the Server.
            offset 0
        ) message
        where chat.server_id = ${scope.serverId}
          and ${readableChat(scope, 'chat')}
    `;
}

function dmSide(scope: AdventScope, chat: SQL): SQL {
    return sql`(${chat}.dm_member_one_user_id = ${scope.userId} or ${chat}.dm_member_two_user_id = ${scope.userId})`;
}

/**
 * Agents that work for the member: ones they created, plus ones they keep a DM
 * with. Agents are Server-wide, so this is the closest durable tie between a
 * human and an Agent's turns and tokens. CTE body with `id`, `display_name`.
 */
export function memberAgents(scope: AdventScope): SQL {
    return sql`
        select agent.id, agent.display_name
        from agents agent
        where agent.server_id = ${scope.serverId}
          and (
              agent.created_by_user_id = ${scope.userId}
              or exists (
                  select 1
                  from chats dm
                  where dm.server_id = agent.server_id
                    and dm.kind = 'dm'
                    and dm.dm_member_one_user_id = ${scope.userId}
                    and dm.dm_agent_id = agent.id
              )
          )
    `;
}

/** A Server member's name as others see it: display name, else handle. */
export function personName(userColumn: SQL, scope: AdventScope): SQL {
    return sql`(
        select coalesce(person.display_name, membership.handle)
        from users person
        left join server_memberships membership
            on membership.server_id = ${scope.serverId} and membership.user_id = person.id
        where person.id = ${userColumn}
    )`;
}
