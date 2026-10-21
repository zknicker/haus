import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';

const retentionDays = 30;
const sweepBatch = 100;

export type HeartbeatCheckOutcome = 'paused' | 'queued' | 'skipped' | 'yielded';
export type HeartbeatCheckSkipReason =
    | 'busy'
    | 'no-activity'
    | 'not-configured'
    | 'plan-limit'
    | 'stopped';

export interface HeartbeatCheckInput {
    agentId: string;
    kind: 'daytime' | 'nightly';
    localDate: string;
    outcome: HeartbeatCheckOutcome;
    /** The stopped run; required for `yielded`, absent otherwise. */
    runId?: string;
    serverId: string;
    skipReason?: HeartbeatCheckSkipReason;
    slot: string;
}

/**
 * Records one heartbeat decision for the Activity Log
 * (specs/heartbeat.md#observability), inside the decision's own transaction.
 * A repeat of the same slot and outcome is a no-op, and an Agent the Server does
 * not hold (a slot announced for the wrong Server) records nothing. Rows past
 * retention for this Agent are swept a bounded batch at a time.
 */
export async function recordHeartbeatCheck(
    tx: HausDatabase,
    input: HeartbeatCheckInput
): Promise<void> {
    await tx.execute(sql`
        insert into agent_heartbeat_checks
            (server_id, id, agent_id, kind, local_date, slot, outcome, skip_reason, run_id)
        select agent.server_id, ${createOpaqueId('hbc')}, agent.id, ${input.kind},
               ${input.localDate}, ${input.slot}, ${input.outcome},
               ${input.skipReason ?? null}, ${input.runId ?? null}
        from agents agent
        where agent.server_id = ${input.serverId} and agent.id = ${input.agentId}
          and not exists (
              -- A repeat of a slot that already queued must not read as a skip.
              select 1 from agent_heartbeat_checks queued
              where queued.server_id = agent.server_id
                and queued.agent_id = agent.id
                and queued.kind = ${input.kind}
                and queued.local_date = ${input.localDate}
                and queued.slot = ${input.slot}
                and queued.outcome = 'queued'
                and ${input.outcome} in ('skipped', 'paused')
          )
        on conflict (server_id, agent_id, kind, local_date, slot, outcome) do nothing
    `);
    await tx.execute(sql`
        delete from agent_heartbeat_checks
        where id in (
            select id from agent_heartbeat_checks
            where server_id = ${input.serverId}
              and agent_id = ${input.agentId}
              and created_at < now() - make_interval(days => ${retentionDays})
            limit ${sweepBatch}
        )
    `);
}
