import type {
    CloudAgentModelParamName,
    WorkerBranch,
    WorkerOutcome,
    WorkerProviderResult,
    WorkerStallCode,
    WorkerTurnInput,
    WorkerTurnModelParam,
    WorkerTurnStatus,
    WorkerUsage,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { settledWorkerStatuses, workerStatuses, workersTable } from './workers.ts';

/**
 * One turn of a Worker. A follow-up adds a turn rather than replacing the
 * Worker, so earlier outcomes stay inspectable. `input` is null only for a turn
 * migrated while its instructions still sat on a Computer; the drain fills it.
 */
export const workerTurnsTable = pgTable(
    'worker_turns',
    {
        acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
        branches: bunJsonb('branches').notNull().$type<WorkerBranch[]>().default([]),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        /** Set when the place took the turn; the turn counts against its place's limit until settled. */
        dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
        errorCode: text('error_code'),
        /** The Agent send nonces this turn's follow-ups came from, so a retried send queues once. */
        followUpNonces: text('follow_up_nonces')
            .array()
            .notNull()
            .default(sql`'{}'::text[]`),
        id: text('id').primaryKey(),
        input: bunJsonb('input').$type<WorkerTurnInput[] | null>(),
        /** Saved params the sent model no longer offered, so they took its default. */
        modelDroppedParams: bunJsonb('model_dropped_params')
            .notNull()
            .$type<CloudAgentModelParamName[]>()
            .default([]),
        /** The saved model this turn could not send, so it fell back to Auto. */
        modelFallbackFrom: text('model_fallback_from'),
        /**
         * The model sent to the provider: a catalog id, `default` for Auto, or
         * `null` when none was sent, so the account's default model chose.
         */
        modelId: text('model_id'),
        /** The params sent with `modelId`; an unsent one took the model's default. */
        modelParams: bunJsonb('model_params').notNull().$type<WorkerTurnModelParam[]>().default([]),
        /** The Computer's newest applied observation, so a stale one is a no-op. */
        observedAt: timestamp('observed_at', { withTimezone: true }),
        outcome: bunJsonb('outcome').$type<WorkerOutcome | null>(),
        /** The full provider result `summary` is cut from (TECH-8), kept as evidence. */
        providerResult: bunJsonb('provider_result').$type<WorkerProviderResult | null>(),
        providerRunId: text('provider_run_id'),
        rawStatus: text('raw_status'),
        serverId: text('server_id').notNull(),
        /** Why a live turn is stuck, and since when; a settled turn has neither. */
        stallCode: text('stall_code').$type<WorkerStallCode>(),
        stallSince: timestamp('stall_since', { withTimezone: true }),
        startedAt: timestamp('started_at', { withTimezone: true }),
        status: text('status').notNull().default('queued').$type<WorkerTurnStatus>(),
        /** A stop reaches each live turn, so the intent survives a later follow-up. */
        stopRequestedAt: timestamp('stop_requested_at', { withTimezone: true }),
        stopRequestedByAgentId: text('stop_requested_by_agent_id'),
        stopRequestedByUserId: text('stop_requested_by_user_id'),
        summary: text('summary'),
        terminalAt: timestamp('terminal_at', { withTimezone: true }),
        usage: bunJsonb('usage').$type<WorkerUsage | null>(),
        workerId: text('worker_id').notNull(),
    },
    (table) => [
        unique('worker_turns_server_id_key').on(table.serverId, table.id),
        index('worker_turns_worker_idx').on(table.serverId, table.workerId, table.createdAt),
        foreignKey({
            columns: [table.serverId, table.workerId],
            foreignColumns: [workersTable.serverId, workersTable.id],
            name: 'worker_turns_worker_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.stopRequestedByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'worker_turns_stop_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.stopRequestedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'worker_turns_stop_membership_fk',
        }),
        check('worker_turns_id_shape', sql`${table.id} ~ '^(car|wkt)_[A-Za-z0-9_-]{16}$'`),
        check('worker_turns_status', sql.raw(`"worker_turns"."status" in ${workerStatuses}`)),
        check(
            'worker_turns_error_shape',
            sql.raw(
                `"worker_turns"."error_code" is null
                or "worker_turns"."status" in ${settledWorkerStatuses}`
            )
        ),
        check(
            'worker_turns_stall_shape',
            sql.raw(
                `("worker_turns"."stall_code" is null)
                = ("worker_turns"."stall_since" is null)
                and ("worker_turns"."stall_code" is null
                    or "worker_turns"."status" not in ${settledWorkerStatuses})`
            )
        ),
        check(
            'worker_turns_stop_shape',
            sql`(${table.stopRequestedAt} is not null) = (num_nonnulls(
                ${table.stopRequestedByUserId}, ${table.stopRequestedByAgentId}
            ) = 1)`
        ),
        check(
            'worker_turns_model_shape',
            sql`${table.modelFallbackFrom} is null or coalesce(${table.modelId}, 'default') = 'default'`
        ),
        check(
            'worker_turns_model_params_shape',
            sql`jsonb_typeof(${table.modelParams}) = 'array' and jsonb_typeof(${table.modelDroppedParams}) = 'array' and (coalesce(${table.modelId}, 'default') <> 'default' or (${table.modelParams} = '[]'::jsonb and ${table.modelDroppedParams} = '[]'::jsonb))`
        ),
        check(
            'worker_turns_terminal_shape',
            sql.raw(
                `("worker_turns"."status" in ${settledWorkerStatuses})
                = ("worker_turns"."terminal_at" is not null)`
            )
        ),
        check(
            'worker_turns_provider_result_shape',
            sql`${table.providerResult} is null or (
                jsonb_typeof(${table.providerResult}) = 'object'
                and char_length(${table.providerResult}->>'text') between 1 and 65536
                and jsonb_typeof(${table.providerResult}->'clipped') = 'boolean'
            )`
        ),
        check(
            'worker_turns_input_shape',
            sql`${table.input} is null or jsonb_typeof(${table.input}) = 'array'`
        ),
    ]
);
