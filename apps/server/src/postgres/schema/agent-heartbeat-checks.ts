import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serversTable } from './servers.ts';

/**
 * One row per heartbeat decision the Server made for a slot its Computer announced
 * (specs/heartbeat.md#observability): queued, skipped, or paused by the plan meter,
 * plus `yielded` when a daytime run gave way to addressed work (then `run_id` names
 * the stopped run). It feeds the Activity Heartbeats view; a run that started shows
 * from `agent_run_triggers` and `agent_turns`. Rows are kept 30 days. A repeated
 * slot with the same outcome is one row.
 */
export const agentHeartbeatChecksTable = pgTable(
    'agent_heartbeat_checks',
    {
        agentId: text('agent_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        kind: text('kind').notNull().$type<'daytime' | 'nightly'>(),
        localDate: text('local_date').notNull(),
        outcome: text('outcome').notNull().$type<'queued' | 'skipped' | 'paused' | 'yielded'>(),
        /** Set exactly for `yielded`: the daytime run that was stopped. */
        runId: text('run_id'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        skipReason: text('skip_reason').$type<
            'busy' | 'stopped' | 'plan-limit' | 'no-activity' | 'not-configured'
        >(),
        slot: text('slot').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_heartbeat_checks_agent_fk',
        }).onDelete('cascade'),
        index('agent_heartbeat_checks_agent_created_idx').on(
            table.serverId,
            table.agentId,
            table.createdAt
        ),
        uniqueIndex('agent_heartbeat_checks_slot_key').on(
            table.serverId,
            table.agentId,
            table.kind,
            table.localDate,
            table.slot,
            table.outcome
        ),
        check('agent_heartbeat_checks_kind', sql`${table.kind} in ('daytime', 'nightly')`),
        check(
            'agent_heartbeat_checks_outcome',
            sql`${table.outcome} in ('queued', 'skipped', 'paused', 'yielded')`
        ),
        check(
            'agent_heartbeat_checks_skip_reason',
            sql`(${table.outcome} in ('skipped', 'paused')) = (${table.skipReason} is not null)
                and (${table.outcome} <> 'paused' or ${table.skipReason} = 'plan-limit')
                and (${table.skipReason} is null or ${table.skipReason} in ('busy', 'stopped', 'plan-limit', 'no-activity', 'not-configured'))`
        ),
        check(
            'agent_heartbeat_checks_run',
            sql`(${table.outcome} = 'yielded') = (${table.runId} is not null)`
        ),
    ]
);
