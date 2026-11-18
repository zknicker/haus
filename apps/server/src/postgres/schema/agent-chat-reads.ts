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
import { chatsTable } from './chats.ts';

/**
 * One Agent's durable read position in one Chat (Raft's receiver read
 * cursor). Unlike `agent_inbox_cursors` it outlives session rotation: it is
 * what `haus inbox check` counts unread against and where
 * `haus message read --unread` starts. It only moves forward.
 */
export const agentChatReadsTable = pgTable(
    'agent_chat_reads',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        sequence: integer('sequence').notNull().default(0),
        serverId: text('server_id').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId, table.chatId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_chat_reads_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'agent_chat_reads_chat_fk',
        }).onDelete('cascade'),
        check('agent_chat_reads_nonnegative', sql`${table.sequence} >= 0`),
    ]
);
