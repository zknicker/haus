import type { CloudAgentProvider, WorkerTurnStatus } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { tasksTable } from './tasks.ts';

export const workerStatuses =
    "('queued', 'running', 'pending_input', 'completed', 'failed', 'cancelled', 'expired')";
export const settledWorkerStatuses =
    "('pending_input', 'completed', 'failed', 'cancelled', 'expired')";

/**
 * One Worker: an Agent's scoped run attached to one Task (ADR 0056). Messages
 * link to taskless history through `worker_history_links`. `origin_chat_id` and
 * `launch_message_id` are history pointers from before Workers, with no
 * foreign key; new Workers write null. `carrier_computer_id` runs or carries
 * the Worker. A Worker with no Task is closed, read-only history. A composite
 * foreign key keeps its Agent inside one Server tenant. Provider prompts,
 * credentials, and transcripts never land here.
 */
export const workersTable = pgTable(
    'workers',
    {
        activityAt: timestamp('activity_at', { withTimezone: true }),
        activitySummary: text('activity_summary'),
        agentId: text('agent_id').notNull(),
        carrierComputerId: text('carrier_computer_id').notNull(),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        closingAt: timestamp('closing_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        environmentId: text('environment_id'),
        environmentName: text('environment_name'),
        id: text('id').primaryKey(),
        launchMessageId: text('launch_message_id'),
        originChatId: text('origin_chat_id'),
        place: text('place').notNull().$type<CloudAgentProvider>(),
        providerAgentId: text('provider_agent_id'),
        providerUrl: text('provider_url'),
        repository: text('repository').notNull(),
        serverId: text('server_id').notNull(),
        /** The Agent's start idempotency key, now that a start writes no Message to carry it. */
        startNonce: text('start_nonce'),
        startedAt: timestamp('started_at', { withTimezone: true }),
        startingRef: text('starting_ref'),
        status: text('status').notNull().default('queued').$type<WorkerTurnStatus>(),
        taskId: text('task_id'),
        terminalAt: timestamp('terminal_at', { withTimezone: true }),
        title: text('title').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        unique('workers_server_id_key').on(table.serverId, table.id),
        unique('workers_start_nonce_key').on(table.serverId, table.agentId, table.startNonce),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'workers_task_fk',
        }),
        index('workers_task_idx')
            .on(table.serverId, table.taskId)
            .where(sql`${table.taskId} is not null`),
        index('workers_launch_message_idx').on(table.serverId, table.launchMessageId),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'workers_agent_fk',
        }).onDelete('cascade'),
        index('workers_active_idx')
            .on(table.serverId, table.createdAt)
            .where(sql`${table.status} in ('queued', 'running', 'pending_input')`),
        index('workers_carrier_active_idx')
            .on(table.carrierComputerId, table.createdAt)
            .where(sql`${table.status} in ('queued', 'running')`),
        check('workers_id_shape', sql`${table.id} ~ '^(caw|wkr)_[A-Za-z0-9_-]{16}$'`),
        check('workers_place', sql`${table.place} in ('cursor', 'claude')`),
        check('workers_status', sql.raw(`"workers"."status" in ${workerStatuses}`)),
        check('workers_title_length', sql`char_length(${table.title}) between 1 and 120`),
        check(
            'workers_repository_shape',
            sql`${table.repository} ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'`
        ),
        check(
            'workers_activity_shape',
            sql`(${table.activitySummary} is null) = (${table.activityAt} is null)
                and (${table.activitySummary} is null
                    or char_length(${table.activitySummary}) between 1 and 120)`
        ),
        check(
            'workers_terminal_shape',
            sql.raw(
                `("workers"."status" in ${settledWorkerStatuses})
                = ("workers"."terminal_at" is not null)`
            )
        ),
        check(
            'workers_task_or_closed',
            sql`${table.taskId} is not null or ${table.closedAt} is not null`
        ),
    ]
);
