import type { TriggerKind } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
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
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { serversTable } from './servers.ts';
import { usersTable } from './users.ts';

/**
 * One Agent-owned inbound stimulus. A trigger has no schedule and no
 * recurrence: a `webhook` wakes its owner when an outside system POSTs to its
 * private URL, and a `github` Trigger when a matching GitHub App delivery
 * arrives (its configuration is `github_trigger_configs`). A webhook's bearer
 * secret is stored as a sha256 hash and is readable exactly once, at create
 * and rotate.
 *
 * The anchor says where fires land, and who created it decides that anchor: an
 * Agent anchors on the message where a person asked for the trigger, and a
 * human anchors on the DM with the owning Agent itself, with no anchor message
 * at all. `created_by_user_id` is null exactly when the Agent created it.
 */
export const triggersTable = pgTable(
    'triggers',
    {
        anchorChatId: text('anchor_chat_id').notNull(),
        anchorMessageId: text('anchor_message_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        createdByUserId: text('created_by_user_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        /** Deletion tombstone; retained until Trigger history retention expires. */
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        disabledAt: timestamp('disabled_at', { withTimezone: true }),
        fireCount: integer('fire_count').notNull().default(0),
        id: text('id').primaryKey(),
        instruction: text('instruction'),
        kind: text('kind').notNull().$type<TriggerKind>(),
        lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
        ownerAgentId: text('owner_agent_id').notNull(),
        /** Only a webhook has a secret; a `github` Trigger is fed by the App webhook. */
        secretHash: text('secret_hash'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<'armed' | 'disabled'>(),
        title: text('title').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        unique('triggers_server_id_key').on(table.serverId, table.id),
        index('triggers_owner_idx').on(table.serverId, table.ownerAgentId),
        index('triggers_deleted_idx').on(table.serverId, table.deletedAt),
        foreignKey({
            columns: [table.serverId, table.ownerAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'triggers_owner_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.anchorChatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'triggers_anchor_chat_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.anchorChatId, table.anchorMessageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'triggers_anchor_message_fk',
        }),
        check('triggers_kind', sql`${table.kind} in ('webhook', 'github')`),
        check(
            'triggers_secret_kind',
            sql`(${table.kind} = 'webhook') = (${table.secretHash} is not null)`
        ),
        check('triggers_status', sql`${table.status} in ('armed', 'disabled')`),
        check(
            'triggers_deleted_status',
            sql`${table.deletedAt} is null or ${table.status} = 'disabled'`
        ),
        check('triggers_positive_version', sql`${table.version} > 0`),
        check('triggers_nonnegative_fire_count', sql`${table.fireCount} >= 0`),
        check('triggers_title_length', sql`char_length(${table.title}) between 1 and 200`),
        check(
            'triggers_instruction_size',
            sql`${table.instruction} is null or (
                octet_length(${table.instruction}) between 1 and 4096
            )`
        ),
    ]
);

/**
 * One inbound delivery. The payload is stored verbatim and bounded; the Server
 * never parses or interprets it. `dedupe_key` is the caller's `Idempotency-Key`
 * and is unique per trigger, so a retried delivery replays instead of firing.
 */
export const triggerFiresTable = pgTable(
    'trigger_fires',
    {
        contentType: text('content_type'),
        dedupeKey: text('dedupe_key'),
        id: text('id').primaryKey(),
        payload: text('payload').notNull(),
        payloadBytes: integer('payload_bytes').notNull(),
        receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        triggerId: text('trigger_id').notNull(),
    },
    (table) => [
        unique('trigger_fires_server_id_key').on(table.serverId, table.id),
        uniqueIndex('trigger_fires_dedupe_key')
            .on(table.serverId, table.triggerId, table.dedupeKey)
            .where(sql`${table.dedupeKey} is not null`),
        index('trigger_fires_trigger_idx').on(table.serverId, table.triggerId, table.receivedAt),
        foreignKey({
            columns: [table.serverId, table.triggerId],
            foreignColumns: [triggersTable.serverId, triggersTable.id],
            name: 'trigger_fires_trigger_fk',
        }).onDelete('cascade'),
        check(
            'trigger_fires_payload_size',
            sql`octet_length(${table.payload}) <= 65536
                and ${table.payloadBytes} = octet_length(${table.payload})`
        ),
        check(
            'trigger_fires_dedupe_key_length',
            sql`${table.dedupeKey} is null or char_length(${table.dedupeKey}) between 1 and 200`
        ),
    ]
);
