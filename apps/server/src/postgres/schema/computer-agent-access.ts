import { foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { computersTable } from './computers.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export const computerAgentAccessTable = pgTable(
    'computer_agent_access',
    {
        agentId: text('agent_id').notNull(),
        computerId: text('computer_id').notNull(),
        grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
        grantedByUserId: text('granted_by_user_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.computerId, table.agentId] }),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'computer_agent_access_computer_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'computer_agent_access_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.grantedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'computer_agent_access_granter_fk',
        }).onDelete('cascade'),
    ]
);
