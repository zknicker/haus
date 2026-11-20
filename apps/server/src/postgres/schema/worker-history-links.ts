import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { chatMessagesTable } from './chat-messages.ts';
import { workersTable } from './workers.ts';

/**
 * One Message's link to a Worker from before Tasks (ADR 0044). Only links to
 * taskless history remain: W2 turned every link to a Worker with a Task into a
 * reference to that Task. Links decide who may read that history. Losing the
 * Message or the Worker loses the link, never the other side.
 */
export const workerHistoryLinksTable = pgTable(
    'worker_history_links',
    {
        chatId: text('chat_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        messageId: text('message_id').notNull(),
        /** First-occurrence position among this Message's links; cards render in this order. */
        ordinal: integer('ordinal').notNull(),
        serverId: text('server_id').notNull(),
        workerId: text('worker_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.messageId, table.workerId],
            name: 'worker_history_links_pkey',
        }),
        foreignKey({
            columns: [table.serverId, table.workerId],
            foreignColumns: [workersTable.serverId, workersTable.id],
            name: 'worker_history_links_worker_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'worker_history_links_message_fk',
        }).onDelete('cascade'),
        index('worker_history_links_worker_idx').on(
            table.serverId,
            table.workerId,
            table.createdAt.desc(),
            table.messageId.desc()
        ),
        index('worker_history_links_chat_idx').on(table.serverId, table.chatId),
        check('worker_history_links_ordinal', sql`${table.ordinal} >= 0`),
    ]
);
