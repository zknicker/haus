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
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';

/**
 * One person following, or explicitly unfollowing, one Task's Chat (ADR 0052
 * decision 9). A Task is unread only for its followers.
 */
export const taskFollowsTable = pgTable(
    'task_follows',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        followed: boolean('followed').notNull().default(true),
        serverId: text('server_id').notNull(),
        taskChatId: text('task_chat_id').notNull(),
        taskChatKind: text('task_chat_kind').notNull().default('task'),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.taskChatId, table.userId] }),
        foreignKey({
            columns: [table.serverId, table.taskChatId, table.taskChatKind],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind],
            name: 'task_follows_task_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.userId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'task_follows_membership_fk',
        }).onDelete('cascade'),
        check('task_follows_kind', sql`${table.taskChatKind} = 'task'`),
    ]
);
