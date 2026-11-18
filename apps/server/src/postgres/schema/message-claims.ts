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
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export const messageClaimsTable = pgTable(
    'message_claims',
    {
        /** Claims are Agent work (ADR 0037): only an Agent ever holds one. */
        assigneeAgentId: text('assignee_agent_id'),
        /**
         * The Chat the claim's message lives in: it owns the claim number, the
         * assignee pool, and access.
         */
        chatId: text('chat_id').notNull(),
        claimedAt: timestamp('claimed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        createdByAgentId: text('created_by_agent_id'),
        createdByUserId: text('created_by_user_id'),
        messageId: text('message_id').notNull(),
        number: integer('number').notNull(),
        origin: text('origin').notNull().$type<'claimed' | 'composed' | 'converted'>(),
        serverId: text('server_id').notNull(),
        status: text('status')
            .notNull()
            .default('todo')
            .$type<'todo' | 'in_progress' | 'in_review' | 'done' | 'closed'>(),
        /**
         * When this claim stopped being a background claim for a reason its
         * current row cannot show: the Agent asked for review, or its claiming
         * run settled with the work unfinished. Tier is otherwise derived, so
         * this one stamp is all that has to survive.
         */
        trackedAt: timestamp('tracked_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.messageId] }),
        uniqueIndex('message_claims_chat_number_key').on(
            table.serverId,
            table.chatId,
            table.number
        ),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'message_claims_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'message_claims_message_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.createdByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'message_claims_creator_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'message_claims_creator_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assigneeAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'message_claims_assignee_agent_fk',
        }),
        check(
            'message_claims_creator_shape',
            sql`num_nonnulls(${table.createdByUserId}, ${table.createdByAgentId}) = 1`
        ),
        check('message_claims_positive_number', sql`${table.number} > 0`),
        check('message_claims_positive_version', sql`${table.version} > 0`),
        check(
            'message_claims_status',
            sql`${table.status} in ('todo', 'in_progress', 'in_review', 'done', 'closed')`
        ),
        check(
            'message_claims_origin',
            sql`${table.origin} in ('claimed', 'composed', 'converted')`
        ),
        check(
            'message_claims_claim_shape',
            sql`${table.claimedAt} is null or ${table.assigneeAgentId} is not null`
        ),
        index('message_claims_chat_status_idx').on(table.serverId, table.chatId, table.status),
        // Every Agent turn settles by asking for that Agent's open claims. The
        // predicate is the settle query's, so the index stays proportional to
        // live claims rather than to claim history.
        index('message_claims_open_claim_idx')
            .on(table.serverId, table.assigneeAgentId)
            .where(sql`${table.origin} = 'claimed' and ${table.trackedAt} is null`),
    ]
);
