import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';

/**
 * Removes requeued wakes whose reason went away while their run was active: a
 * Trigger fire of a removed Trigger, a claim assignment for a claim that no longer
 * exists (migration 0119 turned it into a Task), and a Task assignment that is not
 * the current one. An assignment is stale when the Task now belongs to someone
 * else, or when the same Agent holds a newer assignment of it: reassigned away and
 * back while the run was active, which already queued that newer row.
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
                  item.source = 'task_assignment'
                  and (
                      not exists (
                          select 1
                          from tasks as task
                          where task.server_id = item.server_id
                            and task.id = split_part(item.dedupe_key, ':', 2)
                            and task.assignee_agent_id = item.agent_id
                      )
                      or exists (
                          select 1
                          from agent_inbox as newer
                          where newer.server_id = item.server_id
                            and newer.agent_id = item.agent_id
                            and newer.source = 'task_assignment'
                            and split_part(newer.dedupe_key, ':', 2)
                                = split_part(item.dedupe_key, ':', 2)
                            and split_part(newer.dedupe_key, ':', 3)::int
                                > split_part(item.dedupe_key, ':', 3)::int
                      )
                  )
              )
          )
    `);
}
