import type {
    LinearAgentLabelState,
    LinearTriggerDisplay,
    LinearTriggerGroups,
    LinearTriggerProblem,
    LinearWriteStatus,
    LinearWriteTargetType,
} from '@haus/api';
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
    unique,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { linearWorkspacesTable } from './linear.ts';
import { serversTable } from './servers.ts';
import { triggersTable } from './triggers.ts';

// What Haus does in a Linear workspace (specs/linear-app.md#data-model): Agent
// labels, the write ledger, and `linear` Trigger configuration. Links to Agents
// and to tombstoned workspaces have no delete action and are deferred so a
// Server purge cascades cleanly.

/** The single-select `Agent` label group Haus created in one team. */
export const linearLabelGroupsTable = pgTable(
    'linear_label_groups',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        groupLabelId: text('group_label_id')
            .notNull()
            .unique('linear_label_groups_group_label_key'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        teamId: text('team_id').notNull(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.workspaceId, table.teamId] }),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_label_groups_workspace_fk',
        }).onDelete('cascade'),
    ]
);

/** One granted Agent's Haus `Agent` label in one team; `pending` until the worker creates it. */
export const linearAgentLabelsTable = pgTable(
    'linear_agent_labels',
    {
        agentId: text('agent_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        labelId: text('label_id').unique('linear_agent_labels_label_key'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().$type<LinearAgentLabelState>(),
        teamId: text('team_id').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        uniqueIndex('linear_agent_labels_live_key')
            .on(table.workspaceId, table.teamId, table.agentId)
            .where(sql`${table.state} <> 'archived'`),
        index('linear_agent_labels_agent_idx').on(table.serverId, table.agentId),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_agent_labels_workspace_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'linear_agent_labels_agent_fk',
        }),
        check('linear_agent_labels_id_shape', sql`${table.id} ~ '^lnb_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_agent_labels_state',
            sql`${table.state} in ('pending', 'active', 'archived')`
        ),
        check(
            'linear_agent_labels_created',
            sql`${table.state} <> 'active' or ${table.labelId} is not null`
        ),
    ]
);

/**
 * The write ledger: one row per connector mutation. `credential_id` records
 * which actor wrote and outlives the credential, so it is not a foreign key.
 */
export const linearWritesTable = pgTable(
    'linear_writes',
    {
        agentId: text('agent_id').notNull(),
        clientEntityId: uuid('client_entity_id'),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        credentialId: text('credential_id').notNull(),
        fieldFingerprint: text('field_fingerprint').notNull(),
        id: text('id').primaryKey(),
        opIndex: integer('op_index').notNull(),
        requestId: text('request_id').notNull(),
        result: bunJsonb('result').$type<Record<string, unknown> | null>(),
        resultEntityId: text('result_entity_id'),
        resultUpdatedAt: timestamp('result_updated_at', { withTimezone: true }),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<LinearWriteStatus>(),
        targetId: text('target_id'),
        targetType: text('target_type').notNull().$type<LinearWriteTargetType>(),
        tool: text('tool').notNull(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        unique('linear_writes_request_key').on(table.workspaceId, table.requestId, table.opIndex),
        index('linear_writes_correlation_idx').on(
            table.workspaceId,
            table.resultEntityId,
            table.resultUpdatedAt
        ),
        index('linear_writes_created_idx').on(table.createdAt),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_writes_workspace_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'linear_writes_agent_fk',
        }),
        check('linear_writes_id_shape', sql`${table.id} ~ '^lnl_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_writes_status',
            sql`${table.status} in ('pending', 'succeeded', 'failed', 'unknown')`
        ),
        check(
            'linear_writes_target_type',
            sql`${table.targetType} in (
                'issue', 'comment', 'project', 'document', 'label', 'workflow_state',
                'agent_activity'
            )`
        ),
        check(
            'linear_writes_request',
            sql`char_length(${table.requestId}) between 1 and 200 and ${table.opIndex} >= 0`
        ),
        check('linear_writes_fingerprint', sql`${table.fieldFingerprint} ~ '^[0-9a-f]{64}$'`),
        check(
            'linear_writes_succeeded',
            sql`${table.status} <> 'succeeded' or (
                ${table.result} is not null and ${table.completedAt} is not null
            )`
        ),
        check(
            'linear_writes_result_size',
            sql`${table.result} is null or octet_length(${table.result}::text) <= 8192`
        ),
    ]
);

/** The `linear` half of a `linear` Trigger (specs/linear-triggers.md#data-model). */
export const linearTriggerConfigsTable = pgTable(
    'linear_trigger_configs',
    {
        display: bunJsonb('display').notNull().$type<LinearTriggerDisplay>(),
        groups: bunJsonb('groups').notNull().$type<LinearTriggerGroups>(),
        lastSuppressedAt: timestamp('last_suppressed_at', { withTimezone: true }),
        problem: text('problem').$type<LinearTriggerProblem | null>(),
        problemSince: timestamp('problem_since', { withTimezone: true }),
        selfSuppressedCount: integer('self_suppressed_count').notNull().default(0),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        suppressedCount: integer('suppressed_count').notNull().default(0),
        triggerId: text('trigger_id').primaryKey(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        index('linear_trigger_configs_workspace_idx').on(table.serverId, table.workspaceId),
        foreignKey({
            columns: [table.serverId, table.triggerId],
            foreignColumns: [triggersTable.serverId, triggersTable.id],
            name: 'linear_trigger_configs_trigger_fk',
        }).onDelete('cascade'),
        // Workspaces are tombstoned, never deleted under a Trigger.
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_trigger_configs_workspace_fk',
        }),
        check(
            'linear_trigger_configs_problem',
            sql`${table.problem} is null or ${table.problem} in (
                'workspace_removed', 'sign_in_required', 'agent_access_revoked',
                'teams_unavailable', 'references_unavailable'
            )`
        ),
        check(
            'linear_trigger_configs_problem_since',
            sql`(${table.problem} is null) = (${table.problemSince} is null)`
        ),
        check(
            'linear_trigger_configs_nonnegative_suppressed',
            sql`${table.suppressedCount} >= 0 and ${table.selfSuppressedCount} >= 0`
        ),
    ]
);
