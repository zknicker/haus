import type { MessageBodyKind } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    customType,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';

const tsvector = customType<{ data: string }>({
    dataType: () => 'tsvector',
});

export const chatMessagesTable = pgTable(
    'chat_messages',
    {
        authorAgentId: text('author_agent_id'),
        authorUserId: text('author_user_id'),
        // The Message body discriminator (ADR 0025). Optional feature fields
        // never define a Message's type.
        bodyKind: text('body_kind').notNull().default('text').$type<MessageBodyKind>(),
        chatId: text('chat_id').notNull(),
        content: text('content').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        nonce: text('nonce').notNull(),
        /** Direct parent of an inline reply; null for a top-level message. */
        replyToMessageId: text('reply_to_message_id'),
        /** Root of the inline chain; top-level messages point at themselves. */
        replyRootMessageId: text('reply_root_message_id'),
        runId: text('run_id'),
        searchVector: tsvector('search_vector').generatedAlwaysAs(
            sql`to_tsvector('simple', content)`
        ),
        sequence: integer('sequence').notNull(),
        serverId: text('server_id').notNull(),
        /** The Agent session that wrote this; null for every human message. */
        sessionGeneration: integer('session_generation'),
    },
    (table) => [
        unique('chat_messages_server_id_key').on(table.serverId, table.id),
        uniqueIndex('chat_messages_chat_sequence_key').on(
            table.serverId,
            table.chatId,
            table.sequence
        ),
        uniqueIndex('chat_messages_chat_nonce_key').on(table.serverId, table.chatId, table.nonce),
        unique('chat_messages_chat_id_key').on(table.serverId, table.chatId, table.id),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'chat_messages_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.authorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'chat_messages_author_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.authorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'chat_messages_author_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.chatId, table.replyToMessageId],
            foreignColumns: [table.serverId, table.chatId, table.id],
            name: 'chat_messages_reply_parent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.replyRootMessageId],
            foreignColumns: [table.serverId, table.chatId, table.id],
            name: 'chat_messages_reply_root_fk',
        }).onDelete('cascade'),
        check('chat_messages_positive_sequence', sql`${table.sequence} > 0`),
        check(
            'chat_messages_body_kind',
            sql`${table.bodyKind} in ('text', 'ask', 'cloud-agent-work', 'agent-created')`
        ),
        // Every durable Chat message is human-readable, so every row has a
        // human or an Agent author. Agent-only deliveries ride the agent inbox.
        check(
            'chat_messages_author_shape',
            sql`(
                (${table.authorUserId} is not null and ${table.authorAgentId} is null)
                or
                (${table.authorAgentId} is not null and ${table.authorUserId} is null)
            )`
        ),
        check(
            'chat_messages_session_generation',
            sql`${table.sessionGeneration} is null or (
                ${table.sessionGeneration} > 0 and ${table.authorAgentId} is not null
            )`
        ),
        check(
            'chat_messages_reply_shape',
            sql`(
                ${table.replyToMessageId} is null
                and (${table.replyRootMessageId} is null or ${table.replyRootMessageId} = ${table.id})
            )
            or (${table.replyToMessageId} is not null and ${table.replyRootMessageId} is not null)`
        ),
        index('chat_messages_chat_sequence_idx').on(table.serverId, table.chatId, table.sequence),
        index('chat_messages_reply_root_idx').on(
            table.serverId,
            table.chatId,
            table.replyRootMessageId,
            table.sequence
        ),
        index('chat_messages_search_idx').using('gin', table.searchVector),
    ]
);
