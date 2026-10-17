import type { LinearCredentialState } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { linearIdentitiesTable, linearWorkspacesTable } from './linear.ts';
import { serversTable } from './servers.ts';

// Linear actor credentials (specs/linear-app.md#tokens): Server-owned rows the
// Server refreshes; tokens never leave PostgreSQL, Server memory, and the
// per-request MCP `_meta`.

/** An identity's webhook signing secret; the previous one stays valid for 24 hours. */
export const linearIdentitySecretsTable = pgTable(
    'linear_identity_secrets',
    {
        identityId: text('identity_id').primaryKey(),
        previousExpiresAt: timestamp('previous_expires_at', { withTimezone: true }),
        previousWebhookSecret: text('previous_webhook_secret'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        webhookSecret: text('webhook_secret').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.identityId],
            foreignColumns: [linearIdentitiesTable.serverId, linearIdentitiesTable.id],
            name: 'linear_identity_secrets_identity_fk',
        }).onDelete('cascade'),
        check(
            'linear_identity_secrets_previous',
            sql`(${table.previousWebhookSecret} is null) = (${table.previousExpiresAt} is null)`
        ),
    ]
);

/**
 * One actor's OAuth credential: the workspace actor (no identity) or one
 * identity. The Server is the single refresh owner and swaps the pair by
 * compare-and-swap on `refresh_token`, bumping `generation`.
 */
export const linearCredentialsTable = pgTable(
    'linear_credentials',
    {
        accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
        accessToken: text('access_token').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        generation: integer('generation').notNull().default(1),
        id: text('id').primaryKey(),
        identityId: text('identity_id'),
        refreshToken: text('refresh_token').notNull(),
        scopes: text('scopes').array().notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().$type<LinearCredentialState>(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        unique('linear_credentials_server_id_key').on(table.serverId, table.id),
        unique('linear_credentials_identity_key').on(table.identityId),
        uniqueIndex('linear_credentials_workspace_actor_key')
            .on(table.workspaceId)
            .where(sql`${table.identityId} is null`),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_credentials_workspace_fk',
        }).onDelete('cascade'),
        // An identity credential belongs to the identity's own workspace.
        foreignKey({
            columns: [table.serverId, table.workspaceId, table.identityId],
            foreignColumns: [
                linearIdentitiesTable.serverId,
                linearIdentitiesTable.workspaceId,
                linearIdentitiesTable.id,
            ],
            name: 'linear_credentials_identity_fk',
        }).onDelete('cascade'),
        check('linear_credentials_id_shape', sql`${table.id} ~ '^lna_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_credentials_state',
            sql`${table.state} in ('valid', 'refresh_required', 'revoked')`
        ),
        check('linear_credentials_positive_generation', sql`${table.generation} > 0`),
    ]
);

/**
 * The teams one credential's actor can reach, synced at install, on change, and
 * hourly. `member` marks a team the actor's app user is a member of: team
 * settings writes (workflow states, team labels) need membership, not just access.
 */
export const linearTeamAccessTable = pgTable(
    'linear_team_access',
    {
        credentialId: text('credential_id').notNull(),
        member: boolean('member').notNull().default(false),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
        teamId: text('team_id').notNull(),
        teamKey: text('team_key').notNull(),
        teamName: text('team_name').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.credentialId, table.teamId] }),
        foreignKey({
            columns: [table.serverId, table.credentialId],
            foreignColumns: [linearCredentialsTable.serverId, linearCredentialsTable.id],
            name: 'linear_team_access_credential_fk',
        }).onDelete('cascade'),
    ]
);
