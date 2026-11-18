import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export const messageReactionsTable = pgTable(
    'message_reactions',
    {
        actorAgentId: text('actor_agent_id'),
        actorUserId: text('actor_user_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        emoji: text('emoji').notNull(),
        messageId: text('message_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        uniqueIndex('message_reactions_actor_key')
            .on(table.serverId, table.messageId, table.actorAgentId, table.emoji)
            .where(sql`${table.actorAgentId} is not null`),
        uniqueIndex('message_reactions_user_key')
            .on(table.serverId, table.messageId, table.actorUserId, table.emoji)
            .where(sql`${table.actorUserId} is not null`),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'message_reactions_message_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.actorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'message_reactions_actor_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.actorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'message_reactions_actor_user_fk',
        }).onDelete('cascade'),
        check(
            'message_reactions_actor_shape',
            sql`num_nonnulls(${table.actorAgentId}, ${table.actorUserId}) = 1`
        ),
    ]
);
