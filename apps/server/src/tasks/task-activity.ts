import type { TaskActivity } from '@haus/api';
import { sql } from 'drizzle-orm';
import { tasksTable } from '../postgres/schema.ts';

/** The Task's newest message @mentions a person, and no person has posted since. */
export const taskNeedsYouSql = sql<boolean>`exists (
    select 1
    from chat_messages asked
    where asked.server_id = ${tasksTable.serverId}
        and asked.chat_id = ${tasksTable.chatId}
        and asked.author_agent_id = ${tasksTable.agentId}
        and cardinality(asked.mentioned_user_ids) > 0
        and not exists (
            select 1 from chat_messages newer
            where newer.server_id = asked.server_id
                and newer.chat_id = asked.chat_id
                and newer.sequence > asked.sequence
                and (newer.author_user_id is not null or newer.author_agent_id = asked.author_agent_id)
        )
)`;

export const taskActivitySql = sql<TaskActivity>`case
    when ${tasksTable.agentId} is null then 'idle'
    when exists (
        select 1 from agent_delivery delivery
        where delivery.agent_id = ${tasksTable.agentId} and delivery.active_run_id is not null
    ) then 'working'
    when exists (
        select 1 from agent_inbox item
        where item.agent_id = ${tasksTable.agentId} and item.state = 'queued' and item.run_id is null
    ) then case
        when exists (
            select 1 from computers machine
            where machine.server_id = ${tasksTable.serverId}
                and machine.id = ${tasksTable.computerId}
                and machine.health <> 'offline'
        ) then 'working'
        else 'waiting'
    end
    when ${taskNeedsYouSql} then 'waiting'
    when exists (
        select 1 from agent_delivery delivery
        where delivery.agent_id = ${tasksTable.agentId} and delivery.consecutive_failures > 0
    ) then 'failed'
    else 'idle'
end`;
