import { foreignKey, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';

/**
 * One human closing one Thread: Open Threads' only stored fact
 * (specs/open-threads.md). A Thread stays closed until someone else writes past
 * `closed_through_sequence`; reopening deletes the row.
 */
export const threadClosuresTable = pgTable(
    'thread_closures',
    {
        closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
        closedThroughSequence: integer('closed_through_sequence').notNull(),
        serverId: text('server_id').notNull(),
        threadChatId: text('thread_chat_id').notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.threadChatId, table.userId] }),
        foreignKey({
            columns: [table.serverId, table.threadChatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'thread_closures_thread_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.userId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'thread_closures_membership_fk',
        }).onDelete('cascade'),
    ]
);
