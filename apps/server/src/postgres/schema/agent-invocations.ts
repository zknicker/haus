import type {
    InvocationRefusal,
    InvocationOperationKind,
    InvocationOutcome,
    MachineInvocationOutcome,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { attachmentsTable } from './attachments.ts';
import { serversTable } from './servers.ts';

export type AgentInvocationState = 'accepted' | 'finished' | 'sent' | 'unknown';

export const agentInvocationsTable = pgTable(
    'agent_invocations',
    {
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        agentId: text('agent_id').notNull(),
        computerId: text('computer_id'),
        exitCode: integer('exit_code'),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        id: text('id').primaryKey(),
        lateExitCode: integer('late_exit_code'),
        lateOutcome: text('late_outcome').$type<MachineInvocationOutcome>(),
        lateResultAt: timestamp('late_result_at', { withTimezone: true }),
        operationKind: text('operation_kind').notNull().$type<InvocationOperationKind>(),
        outcome: text('outcome').$type<InvocationOutcome>(),
        refusal: text('refusal').$type<InvocationRefusal>(),
        requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
        runId: text('run_id').notNull(),
        seq: integer('seq').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().$type<AgentInvocationState>(),
        timeoutMs: integer('timeout_ms').notNull(),
        toolCallId: text('tool_call_id').notNull(),
    },
    (table) => [
        uniqueIndex('agent_invocations_dispatch_key').on(
            table.serverId,
            table.agentId,
            table.runId,
            table.toolCallId,
            table.seq
        ),
        index('agent_invocations_requested_idx').on(table.requestedAt),
        index('agent_invocations_refusal_idx')
            .on(table.agentId, table.computerId, table.requestedAt)
            .where(sql`${table.refusal} is not null`),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_invocations_agent_fk',
        }).onDelete('cascade'),
        check('agent_invocations_id_shape', sql`${table.id} ~ '^inv_[A-Za-z0-9_-]{16}$'`),
        check(
            'agent_invocations_state',
            sql`${table.state} in ('sent', 'accepted', 'finished', 'unknown')`
        ),
        check(
            'agent_invocations_settled_shape',
            sql`(${table.state} in ('finished', 'unknown')) = (${table.outcome} is not null and ${table.finishedAt} is not null)`
        ),
        check(
            'agent_invocations_unknown_shape',
            sql`(${table.state} = 'unknown') = (coalesce(${table.outcome}, '') = 'unknown')`
        ),
        check(
            'agent_invocations_late_shape',
            sql`(${table.lateOutcome} is null) = (${table.lateResultAt} is null) and (${table.lateOutcome} is null or ${table.state} = 'unknown')`
        ),
        check(
            'agent_invocations_refusal',
            sql`${table.refusal} is null or (${table.refusal} in ('not-found', 'no-access', 'moved', 'off', 'not-listed', 'not-mac', 'offline', 'not-ready', 'locked', 'no-session', 'switched-out') and ${table.state} = 'finished')`
        ),
        check(
            'agent_invocations_sent_shape',
            sql`${table.computerId} is not null or ${table.outcome} = 'offline' or coalesce(${table.refusal}, '') = 'not-found'`
        ),
    ]
);

export const agentInvocationPayloadsTable = pgTable(
    'agent_invocation_payloads',
    {
        agentId: text('agent_id'),
        attachmentId: text('attachment_id').primaryKey(),
        invocationId: text('invocation_id').references(() => agentInvocationsTable.id, {
            onDelete: 'cascade',
        }),
        runId: text('run_id'),
        seq: integer('seq'),
        serverId: text('server_id').notNull(),
        toolCallId: text('tool_call_id'),
        uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index('agent_invocation_payloads_invocation_idx').on(table.invocationId),
        uniqueIndex('agent_invocation_payloads_dispatch_key').on(
            table.serverId,
            table.agentId,
            table.runId,
            table.toolCallId,
            table.seq
        ),
        check(
            'agent_invocation_payloads_owner_shape',
            sql`${table.invocationId} is not null or (${table.agentId} is not null and ${table.runId} is not null and ${table.toolCallId} is not null and ${table.seq} is not null)`
        ),
        foreignKey({
            columns: [table.serverId, table.attachmentId],
            foreignColumns: [attachmentsTable.serverId, attachmentsTable.id],
            name: 'agent_invocation_payloads_attachment_fk',
        }).onDelete('cascade'),
    ]
);
