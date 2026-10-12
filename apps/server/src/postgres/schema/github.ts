import type {
    GithubAccountType,
    GithubInstallationPermissions,
    GithubInstallationStatus,
    GithubRepositorySelection,
    GithubTriggerEvents,
    GithubTriggerProblem,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    bigint,
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
import { bunJsonb } from './bun-jsonb.ts';
import { mcpConnectionsTable } from './mcp.ts';
import { serversTable } from './servers.ts';
import { triggersTable } from './triggers.ts';
import { usersTable } from './users.ts';

// GitHub App state (specs/github-app-connection.md, specs/github-triggers.md).
// GitHub's own ids are bigints; Haus row ids are opaque text.

/**
 * One App installation bound to one Haus Server through one GitHub connection.
 * A `removed` row is a tombstone: it keeps dependent Triggers explainable, has
 * no connection, and is never revived by a different installation.
 */
export const githubInstallationsTable = pgTable(
    'github_installations',
    {
        accessibleRepositoryIds: bigint('accessible_repository_ids', { mode: 'number' })
            .array()
            .notNull()
            .default(sql`'{}'::bigint[]`),
        accessSyncedAt: timestamp('access_synced_at', { withTimezone: true }),
        accountId: bigint('account_id', { mode: 'number' }).notNull(),
        accountLogin: text('account_login').notNull(),
        accountType: text('account_type').notNull().$type<GithubAccountType>(),
        boundByUserId: text('bound_by_user_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        connectionId: text('connection_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        events: text('events').array().notNull(),
        id: text('id').primaryKey(),
        installationId: bigint('installation_id', { mode: 'number' }).notNull(),
        permissions: bunJsonb('permissions').notNull().$type<GithubInstallationPermissions>(),
        removedAt: timestamp('removed_at', { withTimezone: true }),
        repositorySelection: text('repository_selection')
            .notNull()
            .$type<GithubRepositorySelection>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<GithubInstallationStatus>(),
        syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (table) => [
        unique('github_installations_server_id_key').on(table.serverId, table.id),
        uniqueIndex('github_installations_live_installation_key')
            .on(table.installationId)
            .where(sql`${table.status} <> 'removed'`),
        index('github_installations_connection_idx').on(table.serverId, table.connectionId),
        // No delete action: deleting a GitHub connection tombstones its
        // installations first, in the same transaction. Deferred (migration
        // 0082) so a Server purge cascades cleanly.
        foreignKey({
            columns: [table.serverId, table.connectionId],
            foreignColumns: [mcpConnectionsTable.serverId, mcpConnectionsTable.id],
            name: 'github_installations_connection_fk',
        }),
        check('github_installations_id_shape', sql`${table.id} ~ '^ghi_[A-Za-z0-9_-]{16}$'`),
        check(
            'github_installations_account_type',
            sql`${table.accountType} in ('User', 'Organization')`
        ),
        check(
            'github_installations_repository_selection',
            sql`${table.repositorySelection} in ('all', 'selected')`
        ),
        check(
            'github_installations_status',
            sql`${table.status} in ('active', 'suspended', 'removed')`
        ),
        check(
            'github_installations_tombstone',
            sql`(${table.status} = 'removed') = (${table.removedAt} is not null)
                and (${table.status} = 'removed') = (${table.connectionId} is null)`
        ),
    ]
);

/** The `github` half of a `github` Trigger: what it listens to and why it is not firing. */
export const githubTriggerConfigsTable = pgTable(
    'github_trigger_configs',
    {
        events: bunJsonb('events').notNull().$type<GithubTriggerEvents>(),
        installationRowId: text('installation_row_id').notNull(),
        lastSuppressedAt: timestamp('last_suppressed_at', { withTimezone: true }),
        problem: text('problem').$type<GithubTriggerProblem | null>(),
        problemSince: timestamp('problem_since', { withTimezone: true }),
        repositoryIds: bigint('repository_ids', { mode: 'number' })
            .array()
            .notNull()
            .default(sql`'{}'::bigint[]`),
        repositoryNames: text('repository_names').array().notNull().default(sql`'{}'::text[]`),
        repositoryScope: text('repository_scope')
            .notNull()
            .$type<'installation' | 'repositories'>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        suppressedCount: integer('suppressed_count').notNull().default(0),
        triggerId: text('trigger_id').primaryKey(),
    },
    (table) => [
        index('github_trigger_configs_installation_idx').on(
            table.serverId,
            table.installationRowId
        ),
        foreignKey({
            columns: [table.serverId, table.triggerId],
            foreignColumns: [triggersTable.serverId, triggersTable.id],
            name: 'github_trigger_configs_trigger_fk',
        }).onDelete('cascade'),
        // Installations are tombstoned, never deleted under a Trigger. No delete
        // action, deferred (migration 0082) so a Server purge cascades cleanly.
        foreignKey({
            columns: [table.serverId, table.installationRowId],
            foreignColumns: [githubInstallationsTable.serverId, githubInstallationsTable.id],
            name: 'github_trigger_configs_installation_fk',
        }),
        check(
            'github_trigger_configs_repositories',
            sql`(
                ${table.repositoryScope} = 'installation'
                and cardinality(${table.repositoryIds}) = 0
                and cardinality(${table.repositoryNames}) = 0
            ) or (
                ${table.repositoryScope} = 'repositories'
                and cardinality(${table.repositoryIds}) between 1 and 50
                and cardinality(${table.repositoryNames}) = cardinality(${table.repositoryIds})
            )`
        ),
        check(
            'github_trigger_configs_problem',
            sql`${table.problem} is null or ${table.problem} in (
                'installation_removed', 'installation_suspended', 'repositories_unavailable',
                'permissions_missing', 'agent_access_revoked', 'sign_in_required'
            )`
        ),
        check(
            'github_trigger_configs_problem_since',
            sql`(${table.problem} is null) = (${table.problemSince} is null)`
        ),
        check('github_trigger_configs_nonnegative_suppressed', sql`${table.suppressedCount} >= 0`),
    ]
);

/**
 * One GitHub delivery seen by this Server, before routing (no `server_id`).
 * The guid dedupes redelivery and recovery; no payload is stored here.
 */
export const githubWebhookDeliveriesTable = pgTable(
    'github_webhook_deliveries',
    {
        action: text('action'),
        deliveryGuid: text('delivery_guid').primaryKey(),
        event: text('event').notNull(),
        ignoredReason: text('ignored_reason'),
        installationId: bigint('installation_id', { mode: 'number' }),
        receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
        routedCount: integer('routed_count').notNull().default(0),
        source: text('source').notNull().$type<'recovery' | 'webhook'>(),
        state: text('state').notNull().$type<'done' | 'processing'>(),
    },
    (table) => [
        index('github_webhook_deliveries_received_idx').on(table.receivedAt),
        check(
            'github_webhook_deliveries_guid_length',
            sql`char_length(${table.deliveryGuid}) between 1 and 64`
        ),
        check('github_webhook_deliveries_source', sql`${table.source} in ('webhook', 'recovery')`),
        check('github_webhook_deliveries_state', sql`${table.state} in ('processing', 'done')`),
        check('github_webhook_deliveries_nonnegative_routed', sql`${table.routedCount} >= 0`),
    ]
);

/** The recovery watermark over the App's delivery log, one row per App id. */
export const githubDeliveryCursorTable = pgTable(
    'github_delivery_cursor',
    {
        appId: bigint('app_id', { mode: 'number' }).primaryKey(),
        gapFrom: timestamp('gap_from', { withTimezone: true }),
        gapTo: timestamp('gap_to', { withTimezone: true }),
        lastSweptAt: timestamp('last_swept_at', { withTimezone: true }),
        watermark: timestamp('watermark', { withTimezone: true }).notNull(),
    },
    (table) => [
        check(
            'github_delivery_cursor_gap',
            sql`(${table.gapFrom} is null) = (${table.gapTo} is null)`
        ),
    ]
);
