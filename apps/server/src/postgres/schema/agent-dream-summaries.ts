import { foreignKey, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serversTable } from './servers.ts';

/**
 * What a nightly heartbeat says it learned (`haus heartbeat learned`), stored by
 * run id. The summary can arrive before the Computer reports the dream record
 * that `agent_dreams` holds, so it lives apart and is joined at read.
 */
export const agentDreamSummariesTable = pgTable(
    'agent_dream_summaries',
    {
        agentId: text('agent_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        /** The dream run; `agent_dreams.run_id` and `agent_run_triggers.run_id`. */
        runId: text('run_id').primaryKey(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        summary: text('summary').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_dream_summaries_agent_fk',
        }).onDelete('cascade'),
    ]
);

/** The name the Agent API slice imports; `agentDreamSummariesTable` is the repo-conventional one. */
export const agentDreamSummaries = agentDreamSummariesTable;
