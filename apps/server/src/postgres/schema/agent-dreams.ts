import type { AgentDreamFile } from '@haus/api';
import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

/**
 * What each nightly dream changed in the Agent's memory, reported by its Computer
 * when the dream run settles: per-file stats plus one capped unified diff. One row
 * per dream run; the newest `dreamRetentionPerAgent` per Agent are kept.
 */
export const agentDreamsTable = pgTable(
    'agent_dreams',
    {
        agentId: text('agent_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        files: bunJsonb('files').notNull().$type<AgentDreamFile[]>(),
        finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
        patch: text('patch').notNull(),
        /** The dream turn's run; `agent_turns.run_id` and `agent_run_triggers.run_id`. */
        runId: text('run_id').primaryKey(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
        /** Memory held too many files to compare, so `files` and `patch` are empty. */
        truncated: boolean('truncated').notNull().default(false),
    },
    (table) => [
        index('agent_dreams_agent_started_idx').on(
            table.serverId,
            table.agentId,
            table.startedAt,
            table.runId
        ),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_dreams_agent_fk',
        }).onDelete('cascade'),
        check('agent_dreams_span', sql`${table.finishedAt} >= ${table.startedAt}`),
    ]
);
