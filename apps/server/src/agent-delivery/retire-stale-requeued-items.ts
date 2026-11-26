import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';

/**
 * Removes requeued wakes whose reason went away while their run was active: a
 * Trigger fire of a removed Trigger, a claim assignment for a claim that no longer
 * exists (migration 0120 turned it into a Task), and an Issue assignment whose
 * Issue is no longer open past Backlog and assigned to this Agent, directly or
 * through an active Task it started (specs/issues.md).
 */
export async function retireStaleRequeuedItems(db: HausDatabase, agentId: string): Promise<void> {
    await db.execute(sql`
        delete from agent_inbox as item
        where item.agent_id = ${agentId}
          and item.state = 'queued'
          and item.run_id is null
          and (
              (
                  item.source = 'trigger'
                  and not exists (
                      select 1
                      from trigger_fires as fire
                      inner join triggers as trigger_row
                          on trigger_row.server_id = fire.server_id
                         and trigger_row.id = fire.trigger_id
                      where fire.server_id = item.server_id
                        and fire.id = item.dedupe_key
                        and trigger_row.deleted_at is null
                  )
              )
              or (
                  item.source = 'claim_assignment'
                  and not exists (
                      select 1
                      from message_claims as claim
                      where claim.server_id = item.server_id
                        and claim.message_id = split_part(item.dedupe_key, ':', 2)
                  )
              )
              or (
                  item.source = 'issue_assignment'
                  and not exists (
                      select 1
                      from issues as issue
                      left join tasks as task
                          on task.server_id = issue.server_id
                         and task.id = issue.assignee_task_id
                         and task.archived_at is null
                      where issue.server_id = item.server_id
                        and issue.id = split_part(item.dedupe_key, ':', 2)
                        and issue.state in ('todo', 'in_progress')
                        and ${agentId} in (issue.assignee_agent_id, task.created_by_agent_id)
                  )
              )
          )
    `);
}
