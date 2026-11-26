import type { TaskActivity } from '@haus/api';
import { sql } from 'drizzle-orm';
import { tasksTable } from '../postgres/schema.ts';

/** specs/tasks.md#activity-status, derived from the Task agent's delivery state. */
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
    when exists (
        select 1 from agent_delivery delivery
        where delivery.agent_id = ${tasksTable.agentId} and delivery.consecutive_failures > 0
    ) then 'failed'
    else 'idle'
end`;
