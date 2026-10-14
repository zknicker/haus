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
import { imageGenerationsTable } from './image-generations.ts';

/**
 * One Message's link to an image generation (ADR 0044 pattern), recorded in the
 * Message's insert transaction only when the author could already see the
 * generation. Links decide who may see it and which Chats hear its updates.
 * Losing the Message or the generation loses the link, never the other side.
 */
export const imageGenerationLinksTable = pgTable(
    'image_generation_links',
    {
        chatId: text('chat_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        generationId: text('generation_id').notNull(),
        messageId: text('message_id').notNull(),
        /** First-occurrence position among this Message's links; cards render in this order. */
        ordinal: integer('ordinal').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.messageId, table.generationId],
            name: 'image_generation_links_pkey',
        }),
        foreignKey({
            columns: [table.serverId, table.generationId],
            foreignColumns: [imageGenerationsTable.serverId, imageGenerationsTable.id],
            name: 'image_generation_links_generation_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'image_generation_links_message_fk',
        }).onDelete('cascade'),
        index('image_generation_links_generation_idx').on(
            table.serverId,
            table.generationId,
            table.createdAt.desc(),
            table.messageId.desc()
        ),
        index('image_generation_links_chat_idx').on(table.serverId, table.chatId),
        check('image_generation_links_ordinal', sql`${table.ordinal} >= 0`),
    ]
);
