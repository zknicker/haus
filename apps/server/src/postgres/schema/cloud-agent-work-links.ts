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
import { cloudAgentWorkTable } from './cloud-agents.ts';

/**
 * One Message's link to Cloud Agent work (ADR 0044), recorded at send time
 * only when the author could already see the work. Links decide who may see
 * the work and which Chats hear its lifecycle. Losing the Message or the work
 * loses the link, never the other side.
 */
export const cloudAgentWorkLinksTable = pgTable(
    'cloud_agent_work_links',
    {
        chatId: text('chat_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        messageId: text('message_id').notNull(),
        /** First-occurrence position among this Message's links; cards render in this order. */
        ordinal: integer('ordinal').notNull(),
        serverId: text('server_id').notNull(),
        workId: text('work_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.messageId, table.workId],
            name: 'cloud_agent_work_links_pkey',
        }),
        foreignKey({
            columns: [table.serverId, table.workId],
            foreignColumns: [cloudAgentWorkTable.serverId, cloudAgentWorkTable.id],
            name: 'cloud_agent_work_links_work_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'cloud_agent_work_links_message_fk',
        }).onDelete('cascade'),
        index('cloud_agent_work_links_work_idx').on(
            table.serverId,
            table.workId,
            table.createdAt.desc(),
            table.messageId.desc()
        ),
        index('cloud_agent_work_links_chat_idx').on(table.serverId, table.chatId),
        check('cloud_agent_work_links_ordinal', sql`${table.ordinal} >= 0`),
    ]
);
