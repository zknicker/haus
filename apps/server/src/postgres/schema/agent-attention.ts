import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';

export const agentChannelMutesTable = pgTable(
    'agent_channel_mutes',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        chatKind: text('chat_kind').notNull().default('channel'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId, table.chatId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_channel_mutes_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.chatKind],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind],
            name: 'agent_channel_mutes_chat_fk',
        }).onDelete('cascade'),
        check('agent_channel_mutes_kind', sql`${table.chatKind} = 'channel'`),
    ]
);

export const agentTaskFollowsTable = pgTable(
    'agent_task_follows',
    {
        agentId: text('agent_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        followed: boolean('followed').notNull().default(true),
        serverId: text('server_id').notNull(),
        taskChatId: text('task_chat_id').notNull(),
        taskChatKind: text('task_chat_kind').notNull().default('task'),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId, table.taskChatId] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_task_follows_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.taskChatId, table.taskChatKind],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind],
            name: 'agent_task_follows_task_fk',
        }).onDelete('cascade'),
        check('agent_task_follows_kind', sql`${table.taskChatKind} = 'task'`),
    ]
);
