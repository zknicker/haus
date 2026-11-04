import { sql } from 'drizzle-orm';
import {
    boolean,
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
import { bunJsonb } from './bun-jsonb.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { serversTable } from './servers.ts';

export const remindersTable = pgTable(
    'reminders',
    {
        anchorChatId: text('anchor_chat_id').notNull(),
        anchorMessageId: text('anchor_message_id').notNull(),
        /** Consecutive failed (non-zero exit or timeout) script runs, reset on success. */
        consecutiveFailures: integer('consecutive_failures').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        /** What to do when it fires, in full; the title is only its short label. */
        description: text('description'),
        /** `--fail-after`: consecutive failures required before waking once. Null disables it. */
        failAfter: integer('fail_after'),
        /**
         * Whether the current failure streak already woke the Agent once, so a
         * `--fail-after` edited mid-streak (lowered past the current count, or
         * disabled) can never wake it a second time for the same streak.
         */
        failureStreakWoken: boolean('failure_streak_woken').notNull().default(false),
        fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        /** Hash of the last script output that woke the Agent, for `--wake-on-change`. */
        lastWakeOutputHash: text('last_wake_output_hash'),
        ownerAgentId: text('owner_agent_id').notNull(),
        repeat: text('repeat'),
        script: text('script'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<'canceled' | 'fired' | 'scheduled'>(),
        timezone: text('timezone').notNull(),
        title: text('title').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
        version: integer('version').notNull().default(1),
        /** `--wake-on-change`: a repeated waking output counts as a quiet "unchanged" run. */
        wakeOnChange: boolean('wake_on_change').notNull().default(false),
    },
    (table) => [
        unique('reminders_server_id_key').on(table.serverId, table.id),
        index('reminders_due_idx')
            .on(table.fireAt, table.id)
            .where(sql`${table.status} = 'scheduled'`),
        // A dream's follow-ups: reminders an Agent created inside the run's window.
        index('reminders_owner_created_idx').on(
            table.serverId,
            table.ownerAgentId,
            table.createdAt
        ),
        foreignKey({
            columns: [table.serverId, table.ownerAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'reminders_owner_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.anchorChatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'reminders_anchor_chat_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.anchorChatId, table.anchorMessageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'reminders_anchor_message_fk',
        }),
        check('reminders_status', sql`${table.status} in ('scheduled', 'fired', 'canceled')`),
        check('reminders_positive_version', sql`${table.version} > 0`),
        check('reminders_title_length', sql`char_length(${table.title}) between 1 and 300`),
        check(
            'reminders_description_length',
            sql`${table.description} is null or char_length(${table.description}) between 1 and 300`
        ),
        check(
            'reminders_script_size',
            sql`${table.script} is null or (
                octet_length(${table.script}) between 1 and 16384
            )`
        ),
        check(
            'reminders_fail_after_range',
            sql`${table.failAfter} is null or (${table.failAfter} between 1 and 20)`
        ),
        check('reminders_consecutive_failures_range', sql`${table.consecutiveFailures} >= 0`),
    ]
);

export const reminderCommandsTable = pgTable(
    'reminder_commands',
    {
        action: text('action').notNull(),
        actorId: text('actor_id').notNull(),
        actorKind: text('actor_kind').notNull().$type<'agent' | 'user'>(),
        appliedVersion: integer('applied_version').notNull(),
        commandId: text('command_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        reminderId: text('reminder_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        resultSnapshot: bunJsonb('result_snapshot').notNull().$type<unknown>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        uniqueIndex('reminder_commands_actor_command_key').on(
            table.serverId,
            table.actorKind,
            table.actorId,
            table.commandId
        ),
        foreignKey({
            columns: [table.serverId, table.reminderId],
            foreignColumns: [remindersTable.serverId, remindersTable.id],
            name: 'reminder_commands_reminder_fk',
        }).onDelete('cascade'),
        check('reminder_commands_actor_kind', sql`${table.actorKind} in ('agent', 'user')`),
        check('reminder_commands_positive_version', sql`${table.appliedVersion} > 0`),
    ]
);

export const reminderFiresTable = pgTable(
    'reminder_fires',
    {
        /** How long the script ran, in milliseconds. Null for a reminder with no script. */
        durationMs: integer('duration_ms'),
        firedAt: timestamp('fired_at', { withTimezone: true }).notNull(),
        /**
         * Whether the reminder ran a script when it woke. A reminder gains or
         * loses its script over its life, so the fire has to carry its own
         * answer; reading `reminders.script` later relabels settled history.
         */
        hasScript: boolean('has_script').notNull().default(false),
        id: text('id').primaryKey(),
        /**
         * What this run did: `quiet` (nothing to report), `unchanged` (would have
         * woken, but its output matched the last waking run), `woke`, `failed`
         * (a failure that stayed quiet under `--fail-after`), or `recovered`
         * (first success after a failure streak that woke). Null until a script
         * fire settles; a plain reminder is always `woke`.
         */
        outcome: text('outcome').$type<ReminderFireOutcome | null>(),
        scriptExitCode: integer('script_exit_code'),
        scriptOutput: text('script_output'),
        scriptTimedOut: boolean('script_timed_out').notNull().default(false),
        reminderId: text('reminder_id').notNull(),
        scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        /** Tokens the woken turn reported, when the runtime reports usage. */
        wakeTotalTokens: integer('wake_total_tokens'),
    },
    (table) => [
        unique('reminder_fires_server_id_key').on(table.serverId, table.id),
        uniqueIndex('reminder_fires_logical_fire_key').on(
            table.serverId,
            table.reminderId,
            table.scheduledFor
        ),
        foreignKey({
            columns: [table.serverId, table.reminderId],
            foreignColumns: [remindersTable.serverId, remindersTable.id],
            name: 'reminder_fires_reminder_fk',
        }).onDelete('cascade'),
        check(
            'reminder_fires_script_output_size',
            sql`${table.scriptOutput} is null or octet_length(${table.scriptOutput}) <= 65536`
        ),
        check(
            'reminder_fires_outcome',
            sql`${table.outcome} is null or ${table.outcome} in
                ('quiet', 'unchanged', 'woke', 'failed', 'recovered')`
        ),
        check(
            'reminder_fires_duration_ms_range',
            sql`${table.durationMs} is null or ${table.durationMs} >= 0`
        ),
        check(
            'reminder_fires_wake_total_tokens_range',
            sql`${table.wakeTotalTokens} is null or ${table.wakeTotalTokens} >= 0`
        ),
    ]
);

export type ReminderFireOutcome = 'failed' | 'quiet' | 'recovered' | 'unchanged' | 'woke';

export const reminderAgentAttentionTable = pgTable(
    'reminder_agent_attention',
    {
        agentId: text('agent_id').notNull(),
        anchorChatId: text('anchor_chat_id').notNull(),
        fireId: text('fire_id').notNull(),
        id: text('id').primaryKey(),
        kind: text('attention_kind').notNull().$type<'reminder' | 'reminder_script'>(),
        queuedAt: timestamp('queued_at', { withTimezone: true }).notNull(),
        reminderId: text('reminder_id').notNull(),
        script: text('script'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        uniqueIndex('reminder_agent_attention_server_id_key').on(table.serverId, table.id),
        uniqueIndex('reminder_agent_attention_fire_key').on(table.serverId, table.fireId),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'reminder_agent_attention_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.reminderId],
            foreignColumns: [remindersTable.serverId, remindersTable.id],
            name: 'reminder_agent_attention_reminder_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.fireId],
            foreignColumns: [reminderFiresTable.serverId, reminderFiresTable.id],
            name: 'reminder_agent_attention_fire_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.anchorChatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'reminder_agent_attention_anchor_chat_fk',
        }),
        check(
            'reminder_agent_attention_shape',
            sql`(
                (${table.kind} = 'reminder' AND ${table.script} IS NULL)
                OR
                (${table.kind} = 'reminder_script'
                    AND octet_length(${table.script}) between 1 and 16384)
            )`
        ),
    ]
);
