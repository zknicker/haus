import type { AgentContextSnapshot } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';

export const agentContextSnapshotsTable = pgTable(
    'agent_context_snapshots',
    {
        agentId: text('agent_id').notNull(),
        measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
        reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
        runId: text('run_id').notNull(),
        serverId: text('server_id').notNull(),
        sessionGeneration: integer('session_generation').notNull(),
        snapshot: bunJsonb('snapshot').notNull().$type<AgentContextSnapshot>(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_context_snapshots_agent_fk',
        }).onDelete('cascade'),
        check('agent_context_snapshots_generation', sql`${table.sessionGeneration} >= 0`),
    ]
);
