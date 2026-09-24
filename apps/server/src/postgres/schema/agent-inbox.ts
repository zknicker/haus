import type { AddressedReason } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    primaryKey,
    real,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { serversTable } from './servers.ts';

export const agentInboxCursorsTable = pgTable(
    'agent_inbox_cursors',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        seenUpToSequence: integer('seen_up_to_sequence').notNull().default(0),
        serverId: text('server_id').notNull(),
        sessionGeneration: integer('session_generation').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.agentId, table.sessionGeneration, table.chatId],
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_inbox_cursors_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'agent_inbox_cursors_chat_fk',
        }).onDelete('cascade'),
        check(
            'agent_inbox_cursors_nonnegative',
            sql`${table.seenUpToSequence} >= 0
                and ${table.sessionGeneration} > 0`
        ),
    ]
);

export const agentInboxExactVisibilityTable = pgTable(
    'agent_inbox_exact_visibility',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        messageId: text('message_id').notNull(),
        seenAt: timestamp('seen_at', { withTimezone: true }),
        servedRunId: text('served_run_id'),
        serverId: text('server_id').notNull(),
        servedAt: timestamp('served_at', { withTimezone: true }),
        settledRunId: text('settled_run_id'),
        sessionGeneration: integer('session_generation').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [
                table.serverId,
                table.agentId,
                table.sessionGeneration,
                table.chatId,
                table.messageId,
            ],
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_inbox_exact_visibility_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'agent_inbox_exact_visibility_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'agent_inbox_exact_visibility_message_fk',
        }).onDelete('cascade'),
        // Chat engagement reads one run's visibility at a time (ADR 0034).
        index('agent_inbox_exact_visibility_run_idx').on(table.agentId, table.servedRunId),
        check('agent_inbox_exact_visibility_generation', sql`${table.sessionGeneration} > 0`),
    ]
);

export const agentMessageDraftsTable = pgTable(
    'agent_message_drafts',
    {
        agentId: text('agent_id').notNull(),
        attachmentIds: bunJsonb('attachment_ids').notNull().$type<string[]>().default([]),
        chatId: text('chat_id').notNull(),
        content: text('content').notNull(),
        reholdCount: integer('rehold_count').notNull(),
        /** Direct parent of a held inline reply, if any. */
        replyToMessageId: text('reply_to_message_id'),
        savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
        sessionGeneration: integer('session_generation').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.agentId, table.sessionGeneration, table.chatId],
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_message_drafts_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'agent_message_drafts_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.replyToMessageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'agent_message_drafts_reply_parent_fk',
        }).onDelete('cascade'),
        check(
            'agent_message_drafts_shape',
            sql`${table.reholdCount} > 0 and ${table.sessionGeneration} > 0`
        ),
    ]
);

/**
 * The Agent inbox: the durable ledger of everything offered to one Agent.
 * Ordinary Chat deliveries, Cloud Agent attentions, task assignments, and Trigger
 * and Reminder fires all ride these rows, each keyed by its own identity.
 * `state` is the live-queue gate: only a `queued` row is deliverable, and every
 * queue read filters on it. `noticeRunId` records
 * that an ordinary identity was offered without exposing its body; an exact
 * pull attaches the row to the active run. Settlement retains the rows proven
 * model-visible as `seen` with the settling `settledRunId`, so a turn's
 * delivery outcome — including a turn that produced nothing — stays readable.
 * A failed turn without durable output returns its rows to `queued` to replay.
 */
export const agentInboxTable = pgTable(
    'agent_inbox',
    {
        /** When the Computer acknowledged the run carrying this row. */
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        /**
         * Why this item names the Agent personally rather than ambiently, decided
         * once when delivery is planned. Null is an ordinary ambient delivery.
         */
        addressedReason: text('addressed_reason').$type<AddressedReason>(),
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        content: text('content').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        dedupeKey: text('dedupe_key').notNull(),
        /**
         * Jev's probability that the message calls for a reply from its addressed
         * Agents, asked with the routing judgment. Null when no judgment ran or it
         * did not answer. Used only to suppress the Chat typing presentation.
         */
        expectsReply: real('expects_reply'),
        id: text('id').primaryKey(),
        /** Whether this Agent was personally named when the immutable message was planned. */
        mentioned: boolean('mentioned').notNull().default(false),
        /** The Agent turn that was offered this identity without exposing its body. */
        noticeRunId: text('notice_run_id'),
        /** The notice-only turn whose first prompt contained this identity. */
        startNoticeRunId: text('start_notice_run_id'),
        runId: text('run_id'),
        /** When the model was shown this body. */
        seenAt: timestamp('seen_at', { withTimezone: true }),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        servedAt: timestamp('served_at', { withTimezone: true }),
        /** The turn that settled this row as model-visible. */
        settledRunId: text('settled_run_id'),
        source: text('source').notNull().default('human'),
        state: text('state')
            .notNull()
            .default('queued')
            .$type<'queued' | 'accepted' | 'served' | 'seen'>(),
        /** A direct Thread mention changed this recipient's explicit unfollow back to followed. */
        threadFollowReactivated: boolean('thread_follow_reactivated').notNull().default(false),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_inbox_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'agent_inbox_chat_fk',
        }).onDelete('cascade'),
        uniqueIndex('agent_inbox_dedupe_key').on(table.serverId, table.agentId, table.dedupeKey),
        index('agent_inbox_queue_idx').on(table.serverId, table.agentId, table.createdAt),
        index('agent_inbox_queued_idx')
            .on(table.serverId, table.agentId, table.createdAt)
            .where(sql`${table.state} = 'queued'`),
        // The run-scoped serving path. Retention makes the table append-only, so
        // the unsettled predicate keeps this index proportional to live work
        // instead of to the whole ledger.
        index('agent_inbox_run_idx')
            .on(table.agentId, table.runId)
            .where(sql`${table.state} <> 'seen'`),
        // The notice lane's equivalent: a run that was only told about a row
        // still holds it, and task liveness reads that edge on every dispatch.
        index('agent_inbox_notice_run_idx')
            .on(table.agentId, table.noticeRunId)
            .where(sql`${table.state} <> 'seen'`),
        // Addressed work drains on a cold start, so the planner filters the live
        // queue on it as cheaply as it filters on state.
        index('agent_inbox_addressed_idx')
            .on(table.serverId, table.agentId)
            .where(sql`${table.addressedReason} is not null and ${table.state} <> 'seen'`),
        check(
            'agent_inbox_addressed_reason',
            sql`${table.addressedReason} is null
                or ${table.addressedReason} in ('dm', 'mention', 'routing', 'sole')`
        ),
        check(
            'agent_inbox_expects_reply',
            sql`${table.expectsReply} is null
                or (${table.expectsReply} >= 0 and ${table.expectsReply} <= 1)`
        ),
        check('agent_inbox_id_shape', sql`${table.id} ~ '^inb_[A-Za-z0-9_-]{16}$'`),
        check('agent_inbox_state', sql`${table.state} in ('queued', 'accepted', 'served', 'seen')`),
    ]
);
