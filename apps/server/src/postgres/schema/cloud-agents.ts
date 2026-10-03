import type {
    CloudAgentBranch,
    CloudAgentModelParamName,
    CloudAgentProvider,
    CloudAgentRunModelParam,
    CloudAgentStatus,
    CloudAgentUsage,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { computersTable } from './computers.ts';
import { serverMembershipsTable } from './server-memberships.ts';

const statuses = "('queued', 'running', 'completed', 'failed', 'cancelled', 'expired')";

/**
 * One Agent's delegation of bounded development work to a provider-hosted
 * agent, anchored to exactly one Message. Composite foreign keys keep the work,
 * its Message, its Chat, its Agent, and its Computer inside one Server tenant.
 * Provider prompts, credentials, and transcripts never land here.
 */
export const cloudAgentWorkTable = pgTable(
    'cloud_agent_work',
    {
        activityAt: timestamp('activity_at', { withTimezone: true }),
        activitySummary: text('activity_summary'),
        agentId: text('agent_id').notNull(),
        cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
        cancelRequestedByAgentId: text('cancel_requested_by_agent_id'),
        cancelRequestedByUserId: text('cancel_requested_by_user_id'),
        chatId: text('chat_id').notNull(),
        computerId: text('computer_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        messageId: text('message_id').notNull(),
        provider: text('provider').notNull().$type<CloudAgentProvider>(),
        providerAgentId: text('provider_agent_id'),
        providerUrl: text('provider_url'),
        repository: text('repository').notNull(),
        serverId: text('server_id').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }),
        startingRef: text('starting_ref'),
        status: text('status').notNull().default('queued').$type<CloudAgentStatus>(),
        terminalAt: timestamp('terminal_at', { withTimezone: true }),
        title: text('title').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('cloud_agent_work_server_id_key').on(table.serverId, table.id),
        unique('cloud_agent_work_message_key').on(table.serverId, table.messageId),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'cloud_agent_work_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.chatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'cloud_agent_work_message_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'cloud_agent_work_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.cancelRequestedByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'cloud_agent_work_cancel_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.cancelRequestedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'cloud_agent_work_cancel_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'cloud_agent_work_computer_fk',
        }).onDelete('cascade'),
        index('cloud_agent_work_active_idx')
            .on(table.serverId, table.createdAt)
            .where(sql`${table.status} in ('queued', 'running')`),
        index('cloud_agent_work_computer_active_idx')
            .on(table.computerId, table.createdAt)
            .where(sql`${table.status} in ('queued', 'running')`),
        check('cloud_agent_work_id_shape', sql`${table.id} ~ '^caw_[A-Za-z0-9_-]{16}$'`),
        check('cloud_agent_work_provider', sql`${table.provider} = 'cursor'`),
        check('cloud_agent_work_status', sql.raw(`"cloud_agent_work"."status" in ${statuses}`)),
        check('cloud_agent_work_title_length', sql`char_length(${table.title}) between 1 and 120`),
        check(
            'cloud_agent_work_repository_shape',
            sql`${table.repository} ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'`
        ),
        check(
            'cloud_agent_work_activity_shape',
            sql`(${table.activitySummary} is null) = (${table.activityAt} is null)
                and (${table.activitySummary} is null
                    or char_length(${table.activitySummary}) between 1 and 120)`
        ),
        check(
            'cloud_agent_work_cancel_shape',
            sql`(${table.cancelRequestedAt} is not null) = (num_nonnulls(
                ${table.cancelRequestedByUserId}, ${table.cancelRequestedByAgentId}
            ) = 1)`
        ),
        check(
            'cloud_agent_work_terminal_shape',
            sql.raw(
                `("cloud_agent_work"."status" in ('completed', 'failed', 'cancelled', 'expired'))
                = ("cloud_agent_work"."terminal_at" is not null)`
            )
        ),
    ]
);

/**
 * One provider Run inside a work record. A follow-up, correction, or retry adds
 * a Run rather than replacing the work, so earlier outcomes stay inspectable.
 */
export const cloudAgentRunsTable = pgTable(
    'cloud_agent_runs',
    {
        branches: bunJsonb('branches').notNull().$type<CloudAgentBranch[]>().default([]),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        errorCode: text('error_code'),
        id: text('id').primaryKey(),
        /** Saved params the sent model no longer offered, so they took its default. */
        modelDroppedParams: bunJsonb('model_dropped_params')
            .notNull()
            .$type<CloudAgentModelParamName[]>()
            .default([]),
        /** The saved model this Run could not send, so it fell back to Auto. */
        modelFallbackFrom: text('model_fallback_from'),
        /**
         * The model sent to the provider: a catalog id, `default` for Auto, or
         * `null` when none was sent, so the account's default model chose.
         */
        modelId: text('model_id'),
        /** The params sent with `modelId`; an unsent one took the model's default. */
        modelParams: bunJsonb('model_params')
            .notNull()
            .$type<CloudAgentRunModelParam[]>()
            .default([]),
        /** The Computer's newest applied observation, so a stale one is a no-op. */
        observedAt: timestamp('observed_at', { withTimezone: true }),
        providerRunId: text('provider_run_id'),
        rawStatus: text('raw_status'),
        serverId: text('server_id').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }),
        status: text('status').notNull().default('queued').$type<CloudAgentStatus>(),
        summary: text('summary'),
        terminalAt: timestamp('terminal_at', { withTimezone: true }),
        usage: bunJsonb('usage').$type<CloudAgentUsage | null>(),
        workId: text('work_id').notNull(),
    },
    (table) => [
        unique('cloud_agent_runs_server_id_key').on(table.serverId, table.id),
        index('cloud_agent_runs_work_idx').on(table.serverId, table.workId, table.createdAt),
        foreignKey({
            columns: [table.serverId, table.workId],
            foreignColumns: [cloudAgentWorkTable.serverId, cloudAgentWorkTable.id],
            name: 'cloud_agent_runs_work_fk',
        }).onDelete('cascade'),
        check('cloud_agent_runs_id_shape', sql`${table.id} ~ '^car_[A-Za-z0-9_-]{16}$'`),
        check('cloud_agent_runs_status', sql.raw(`"cloud_agent_runs"."status" in ${statuses}`)),
        check(
            'cloud_agent_runs_model_shape',
            sql`${table.modelFallbackFrom} is null or coalesce(${table.modelId}, 'default') = 'default'`
        ),
        check(
            'cloud_agent_runs_model_params_shape',
            sql`jsonb_typeof(${table.modelParams}) = 'array' and jsonb_typeof(${table.modelDroppedParams}) = 'array' and (coalesce(${table.modelId}, 'default') <> 'default' or (${table.modelParams} = '[]'::jsonb and ${table.modelDroppedParams} = '[]'::jsonb))`
        ),
        check(
            'cloud_agent_runs_terminal_shape',
            sql.raw(
                `("cloud_agent_runs"."status" in ('completed', 'failed', 'cancelled', 'expired'))
                = ("cloud_agent_runs"."terminal_at" is not null)`
            )
        ),
    ]
);
