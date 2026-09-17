import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';

/**
 * One Agent's durable participation in an inline reply chain. A false row is
 * an explicit unfollow and therefore remains evidence that the chain has had
 * an Agent participant; an absent row means the Agent never joined it.
 */
export const agentMessageFollowsTable = pgTable(
    'agent_message_follows',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        chatKind: text('chat_kind').notNull().default('channel').$type<'channel' | 'dm'>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        followed: boolean('followed').notNull().default(true),
        rootMessageId: text('root_message_id').notNull(),
        serverId: text('server_id').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.chatId, table.rootMessageId, table.agentId],
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_message_follows_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.chatKind],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.kind],
            name: 'agent_message_follows_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.rootMessageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'agent_message_follows_root_message_fk',
        }).onDelete('cascade'),
        check('agent_message_follows_chat_kind', sql`${table.chatKind} in ('channel', 'dm')`),
        index('agent_message_follows_root_idx').on(
            table.serverId,
            table.chatId,
            table.rootMessageId,
            table.followed
        ),
    ]
);
