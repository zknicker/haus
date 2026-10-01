import { foreignKey, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export const chatReadsTable = pgTable(
    'chat_reads',
    {
        chatId: text('chat_id').notNull(),
        readerUserId: text('reader_user_id').notNull(),
        sequence: integer('sequence').notNull().default(0),
        serverId: text('server_id').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.chatId, table.readerUserId] }),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'chat_reads_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.readerUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'chat_reads_reader_membership_fk',
        }).onDelete('cascade'),
    ]
);
