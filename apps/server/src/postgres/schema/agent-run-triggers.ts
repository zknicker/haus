import { foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';
import { serversTable } from './servers.ts';

/**
 * The inbox work the Server chose to wake each Agent run, recorded once at
 * dispatch. It outlives the inbox row (a failed run requeues or retires its
 * rows), so a settled turn can still name what started it. Ids only: `source`
 * and `workId` are the inbox row's own `source` and `dedupe_key`.
 */
export const agentRunTriggersTable = pgTable(
    'agent_run_triggers',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        runId: text('run_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        source: text('source').notNull(),
        workId: text('work_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId, table.runId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_run_triggers_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'agent_run_triggers_chat_fk',
        }).onDelete('cascade'),
    ]
);
