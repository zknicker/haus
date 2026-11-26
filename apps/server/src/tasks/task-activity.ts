import type { TaskActivity } from '@haus/api';
import { sql } from 'drizzle-orm';
import { tasksTable } from '../postgres/schema.ts';

export const taskNeedsYouSql = sql<boolean>`exists (
    select 1
    from task_reports report
    join chat_messages reported
        on reported.server_id = report.server_id and reported.id = report.message_id
    where report.server_id = ${tasksTable.serverId}
        and report.task_id = ${tasksTable.id}
        and report.outcome = 'needs-you'
        and not exists (
            select 1 from task_reports newer
            where newer.server_id = report.server_id
                and newer.task_id = report.task_id
                and newer.created_at > report.created_at
        )
        and not exists (
            select 1 from chat_messages reply
            where reply.server_id = reported.server_id
                and reply.chat_id = reported.chat_id
                and reply.author_user_id is not null
                and reply.sequence > reported.sequence
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
