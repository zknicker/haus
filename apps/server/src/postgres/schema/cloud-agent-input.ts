import type {
    CloudAgentInputAnswers,
    CloudAgentInputRequest,
    CloudAgentStopEvidence,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { cloudAgentRunsTable } from './cloud-agents.ts';
import { computersTable } from './computers.ts';

export const cloudAgentBootstrapTable = pgTable(
    'cloud_agent_bootstrap',
    {
        computerId: text('computer_id')
            .primaryKey()
            .references(() => computersTable.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
        verifiedAt: timestamp('verified_at', { withTimezone: true }),
        protocolVersion: integer('protocol_version'),
        remoteVersion: text('remote_version'),
    },
    (table) => [
        unique('cloud_agent_bootstrap_token_key').on(table.tokenHash),
        check('cloud_agent_bootstrap_token_shape', sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    ]
);

export const cloudAgentCallbacksTable = pgTable(
    'cloud_agent_callbacks',
    {
        runId: text('run_id').primaryKey(),
        serverId: text('server_id').notNull(),
        tokenHash: text('token_hash').notNull(),
        sessionId: text('session_id'),
    },
    (table) => [
        unique('cloud_agent_callbacks_token_key').on(table.tokenHash),
        foreignKey({
            columns: [table.serverId, table.runId],
            foreignColumns: [cloudAgentRunsTable.serverId, cloudAgentRunsTable.id],
            name: 'cloud_agent_callbacks_run_fk',
        }).onDelete('cascade'),
        check('cloud_agent_callbacks_token_shape', sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`),
    ]
);

export const cloudAgentPromptsTable = pgTable(
    'cloud_agent_prompts',
    {
        serverId: text('server_id').notNull(),
        runId: text('run_id').notNull(),
        promptId: text('prompt_id').primaryKey(),
        sessionId: text('session_id').notNull(),
        requestId: text('request_id'),
        toolUseId: text('tool_use_id'),
        stopEvidence: bunJsonb('stop_evidence').$type<CloudAgentStopEvidence>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.runId],
            foreignColumns: [cloudAgentRunsTable.serverId, cloudAgentRunsTable.id],
            name: 'cloud_agent_prompts_run_fk',
        }).onDelete('cascade'),
    ]
);

export const cloudAgentInputTable = pgTable(
    'cloud_agent_input',
    {
        id: text('id').primaryKey(),
        serverId: text('server_id').notNull(),
        runId: text('run_id').notNull(),
        sessionId: text('session_id').notNull(),
        promptId: text('prompt_id').notNull(),
        toolUseId: text('tool_use_id').notNull(),
        questions: bunJsonb('questions').notNull().$type<CloudAgentInputRequest['questions']>(),
        answer: bunJsonb('answer').$type<CloudAgentInputAnswers>(),
        state: text('state').notNull().default('pending').$type<CloudAgentInputRequest['state']>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        resumedPromptId: text('resumed_prompt_id'),
        resumedToolUseId: text('resumed_tool_use_id'),
    },
    (table) => [
        unique('cloud_agent_input_native_key').on(
            table.runId,
            table.sessionId,
            table.promptId,
            table.toolUseId
        ),
        foreignKey({
            columns: [table.serverId, table.runId],
            foreignColumns: [cloudAgentRunsTable.serverId, cloudAgentRunsTable.id],
            name: 'cloud_agent_input_run_fk',
        }).onDelete('cascade'),
        check(
            'cloud_agent_input_state',
            sql`${table.state} in ('pending','answered','resolved','cancelled')`
        ),
        check(
            'cloud_agent_input_answer_shape',
            sql`(${table.state} in ('answered','resolved')) = (${table.answer} is not null) or ${table.state} = 'cancelled'`
        ),
        check(
            'cloud_agent_input_receipt_shape',
            sql`(${table.state} = 'resolved') = (${table.resumedPromptId} is not null and ${table.resumedToolUseId} is not null)`
        ),
    ]
);

export const cloudAgentContinuationsTable = pgTable(
    'cloud_agent_continuations',
    {
        requestId: text('request_id').primaryKey(),
        state: text('state').notNull().default('queued').$type<'queued' | 'sending' | 'accepted'>(),
        attemptedAt: timestamp('attempted_at', { withTimezone: true }),
    },
    (table) => [
        foreignKey({
            columns: [table.requestId],
            foreignColumns: [cloudAgentInputTable.id],
            name: 'cloud_agent_continuations_input_fk',
        }).onDelete('cascade'),
        check(
            'cloud_agent_continuations_state',
            sql`${table.state} in ('queued','sending','accepted')`
        ),
    ]
);
