import { foreignKey, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serversTable } from './servers.ts';

/**
 * The team's shared heartbeat leads (specs/heartbeat.md#outputs). An Agent claims
 * a topic before researching it, so another Agent does not chase the same thing;
 * `done_at` and `finding` record what it learned. Rows expire after 14 days.
 */
export const agentLeadsTable = pgTable(
    'agent_leads',
    {
        agentId: text('agent_id').notNull(),
        /** The Chat of the anchor message, kept so a lead names where it came from. */
        anchorChatId: text('anchor_chat_id'),
        /** The message the lead came from; a second claim on it inside 7 days is refused. */
        anchorMessageId: text('anchor_message_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        doneAt: timestamp('done_at', { withTimezone: true }),
        finding: text('finding'),
        id: text('id').primaryKey(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        topic: text('topic').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_leads_agent_fk',
        }).onDelete('cascade'),
        index('agent_leads_created_idx').on(table.serverId, table.createdAt),
        index('agent_leads_anchor_idx').on(table.serverId, table.anchorMessageId),
    ]
);

/** The name the Agent API slice imports; `agentLeadsTable` is the repo-conventional one. */
export const agentLeads = agentLeadsTable;
