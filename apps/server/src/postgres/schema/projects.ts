import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { chatsTable } from './chats.ts';
import { taskKeysTable } from './task-keys.ts';

export const projectsTable = pgTable(
    'projects',
    {
        chatId: text('chat_id').primaryKey(),
        chatIsAll: boolean('chat_is_all').notNull().default(false),
        chatKind: text('chat_kind').notNull().default('channel'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
        taskKeyId: text('task_key_id').notNull(),
    },
    (table) => [
        unique('projects_server_id_chat_id_key').on(table.serverId, table.chatId),
        unique('projects_task_key_id_key').on(table.taskKeyId),
        foreignKey({
            columns: [table.serverId, table.chatId, table.chatKind, table.chatIsAll],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind, chatsTable.isAll],
            name: 'projects_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.taskKeyId],
            foreignColumns: [taskKeysTable.serverId, taskKeysTable.id],
            name: 'projects_task_key_fk',
        }),
        check('projects_chat_kind', sql`${table.chatKind} = 'channel'`),
        check('projects_chat_not_all', sql`${table.chatIsAll} = false`),
    ]
);
