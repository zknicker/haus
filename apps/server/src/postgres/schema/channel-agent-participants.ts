import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';

export const channelAgentParticipantsTable = pgTable(
    'channel_agent_participants',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        chatKind: text('chat_kind').notNull().default('channel'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.chatId, table.agentId] }),
        foreignKey({
            columns: [table.serverId, table.chatId, table.chatKind],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind],
            name: 'channel_agent_participants_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'channel_agent_participants_agent_fk',
        }).onDelete('cascade'),
        check('channel_agent_participants_kind', sql`${table.chatKind} = 'channel'`),
    ]
);
