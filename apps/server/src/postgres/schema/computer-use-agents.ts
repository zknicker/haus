import { foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { computersTable } from './computers.ts';

export const computerUseAgentsTable = pgTable(
    'computer_use_agents',
    {
        agentId: text('agent_id').notNull(),
        computerId: text('computer_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.computerId, table.agentId] }),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'computer_use_agents_computer_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'computer_use_agents_agent_fk',
        }).onDelete('cascade'),
    ]
);
