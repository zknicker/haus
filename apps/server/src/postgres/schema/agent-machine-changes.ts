import { boolean, foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { computersTable } from './computers.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export const agentMachineChangesTable = pgTable(
    'agent_machine_changes',
    {
        agentId: text('agent_id').notNull(),
        computerId: text('computer_id').notNull(),
        flushId: text('flush_id'),
        flushSentAt: timestamp('flush_sent_at', { withTimezone: true }),
        flushedAt: timestamp('flushed_at', { withTimezone: true }),
        fromLastSynced: boolean('from_last_synced').notNull(),
        requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
        requestedByUserId: text('requested_by_user_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_machine_changes_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'agent_machine_changes_computer_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.requestedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'agent_machine_changes_requester_fk',
        }).onDelete('cascade'),
    ]
);
