import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';

/**
 * Removes a queued Cloud Agent attention whose Run is gone. It can never render,
 * and left queued it would fail every dispatch for this Agent.
 */
export async function retireOrphanedAttentions(db: HausDatabase, agentId: string): Promise<void> {
    await db.execute(sql`
        delete from agent_inbox as item
        where item.agent_id = ${agentId}
          and item.state = 'queued'
          and item.source = 'cloud_agent_work'
          and not exists (
              select 1
              from cloud_agent_runs as run
              where run.server_id = item.server_id
                and run.id = split_part(item.dedupe_key, ':stall:', 1)
          )
    `);
}
