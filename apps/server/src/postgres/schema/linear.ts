import type { LinearIdentityStatus, LinearOauthPurpose, LinearWorkspaceStatus } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { mcpConnectionsTable } from './mcp.ts';
import { serversTable } from './servers.ts';
import { usersTable } from './users.ts';

// The Linear connection's bindings: workspaces, Agent identities, and OAuth
// attempts (specs/linear-app.md#data-model). Linear's own ids are opaque text; Haus row ids are a prefix and
// 16 base64url characters. Cross-links to Agents and to tombstoned workspaces
// have no delete action and are deferred (this table family's migration) so a
// Server purge cascades cleanly.

/**
 * One Linear organization bound to one Haus Server through one Linear
 * connection. A `removed` row is a tombstone: it has no connection, releases
 * the organization binding, and keeps dependent Triggers explainable.
 */
export const linearWorkspacesTable = pgTable(
    'linear_workspaces',
    {
        appUserId: text('app_user_id').notNull(),
        boundByUserId: text('bound_by_user_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        connectionId: text('connection_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        defaultAgentId: text('default_agent_id'),
        id: text('id').primaryKey(),
        lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
        name: text('name').notNull(),
        organizationId: text('organization_id').notNull(),
        removedAt: timestamp('removed_at', { withTimezone: true }),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<LinearWorkspaceStatus>(),
        teamsSyncedAt: timestamp('teams_synced_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        urlKey: text('url_key').notNull(),
    },
    (table) => [
        unique('linear_workspaces_server_id_key').on(table.serverId, table.id),
        unique('linear_workspaces_connection_key').on(table.connectionId),
        uniqueIndex('linear_workspaces_live_organization_key')
            .on(table.organizationId)
            .where(sql`${table.status} <> 'removed'`),
        foreignKey({
            columns: [table.serverId, table.connectionId],
            foreignColumns: [mcpConnectionsTable.serverId, mcpConnectionsTable.id],
            name: 'linear_workspaces_connection_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.defaultAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'linear_workspaces_default_agent_fk',
        }),
        check('linear_workspaces_id_shape', sql`${table.id} ~ '^lnw_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_workspaces_status',
            sql`${table.status} in ('active', 'refresh_required', 'revoked', 'disconnected', 'removed')`
        ),
        check(
            'linear_workspaces_tombstone',
            sql`(${table.status} = 'removed') = (${table.removedAt} is not null)
                and (${table.status} = 'removed') = (${table.connectionId} is null)`
        ),
    ]
);

/**
 * One Agent's Linear identity: a private Linear app the Owner registered for
 * it. A `draft` has no client id until the Owner pastes it and no app user
 * until it is installed.
 */
export const linearIdentitiesTable = pgTable(
    'linear_identities',
    {
        agentId: text('agent_id').notNull(),
        appUserId: text('app_user_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        createdByUserId: text('created_by_user_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        handle: text('handle'),
        id: text('id').primaryKey(),
        lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
        oauthClientId: text('oauth_client_id'),
        organizationId: text('organization_id').notNull(),
        removedAt: timestamp('removed_at', { withTimezone: true }),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<LinearIdentityStatus>(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        unique('linear_identities_server_id_key').on(table.serverId, table.id),
        unique('linear_identities_workspace_key').on(table.serverId, table.workspaceId, table.id),
        uniqueIndex('linear_identities_live_agent_key')
            .on(table.workspaceId, table.agentId)
            .where(sql`${table.status} <> 'removed'`),
        uniqueIndex('linear_identities_live_client_key')
            .on(table.oauthClientId)
            .where(sql`${table.status} <> 'removed'`),
        uniqueIndex('linear_identities_live_app_user_key')
            .on(table.organizationId, table.appUserId)
            .where(sql`${table.status} <> 'removed'`),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_identities_workspace_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'linear_identities_agent_fk',
        }),
        check('linear_identities_id_shape', sql`${table.id} ~ '^lni_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_identities_status',
            sql`${table.status} in ('draft', 'active', 'inactive', 'refresh_required', 'revoked', 'removed')`
        ),
        check(
            'linear_identities_tombstone',
            sql`(${table.status} = 'removed') = (${table.removedAt} is not null)`
        ),
        check(
            'linear_identities_installed',
            sql`${table.status} in ('draft', 'removed') or (
                ${table.oauthClientId} is not null
                and ${table.appUserId} is not null
                and ${table.handle} is not null
            )`
        ),
    ]
);

/**
 * One OAuth install in flight. Only the SHA-256 (hex) of the state is stored;
 * the callback consumes the row atomically, once, before it expires.
 */
export const linearOauthAttemptsTable = pgTable(
    'linear_oauth_attempts',
    {
        codeVerifier: text('code_verifier').notNull(),
        connectionId: text('connection_id'),
        consumedAt: timestamp('consumed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        identityId: text('identity_id'),
        initiatedByUserId: text('initiated_by_user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        purpose: text('purpose').notNull().$type<LinearOauthPurpose>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        stateHash: text('state_hash').notNull().unique('linear_oauth_attempts_state_hash_key'),
    },
    (table) => [
        index('linear_oauth_attempts_expires_idx').on(table.expiresAt),
        foreignKey({
            columns: [table.serverId, table.connectionId],
            foreignColumns: [mcpConnectionsTable.serverId, mcpConnectionsTable.id],
            name: 'linear_oauth_attempts_connection_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.identityId],
            foreignColumns: [linearIdentitiesTable.serverId, linearIdentitiesTable.id],
            name: 'linear_oauth_attempts_identity_fk',
        }).onDelete('cascade'),
        check('linear_oauth_attempts_id_shape', sql`${table.id} ~ '^lno_[A-Za-z0-9_-]{16}$'`),
        check('linear_oauth_attempts_state_hash', sql`${table.stateHash} ~ '^[0-9a-f]{64}$'`),
        check(
            'linear_oauth_attempts_purpose',
            sql`(
                ${table.purpose} = 'workspace_install'
                and ${table.connectionId} is null and ${table.identityId} is null
            ) or (
                ${table.purpose} = 'workspace_reconnect'
                and ${table.connectionId} is not null and ${table.identityId} is null
            ) or (
                ${table.purpose} = 'identity_install'
                and ${table.connectionId} is not null and ${table.identityId} is not null
            )`
        ),
    ]
);
