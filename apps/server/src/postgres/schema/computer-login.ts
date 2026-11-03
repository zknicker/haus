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
import { usersTable } from './users.ts';

export type ComputerLoginGrantStatus = 'approved' | 'consumed' | 'denied' | 'expired' | 'pending';
export type ComputerLoginPurpose = 'login' | 'setup';

export const computerLoginGrantsTable = pgTable(
    'computer_login_grants',
    {
        approvedAt: timestamp('approved_at', { withTimezone: true }),
        approvedByUserId: text('approved_by_user_id'),
        consumedAt: timestamp('consumed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        deviceCodeHash: text('device_code_hash').notNull(),
        deniedAt: timestamp('denied_at', { withTimezone: true }),
        deniedByUserId: text('denied_by_user_id'),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        origin: text('origin').notNull(),
        pollingIntervalMs: integer('polling_interval_ms').notNull(),
        purpose: text('purpose').notNull().default('login').$type<ComputerLoginPurpose>(),
        status: text('status').notNull().$type<ComputerLoginGrantStatus>(),
        userCodeHash: text('user_code_hash').notNull(),
    },
    (table) => [
        uniqueIndex('computer_login_grants_device_code_hash_key').on(table.deviceCodeHash),
        uniqueIndex('computer_login_grants_user_code_hash_key').on(table.userCodeHash),
        index('computer_login_grants_expiry_idx').on(table.expiresAt, table.status),
        foreignKey({
            columns: [table.approvedByUserId],
            foreignColumns: [usersTable.id],
            name: 'computer_login_grants_approved_by_user_id_fkey',
        }),
        foreignKey({
            columns: [table.deniedByUserId],
            foreignColumns: [usersTable.id],
            name: 'computer_login_grants_denied_by_user_id_fkey',
        }),
        check('computer_login_grants_id_shape', sql`${table.id} ~ '^dgr_[A-Za-z0-9_-]{16}$'`),
        check(
            'computer_login_grants_device_code_hash_shape',
            sql`${table.deviceCodeHash} ~ '^[a-f0-9]{64}$'`
        ),
        check(
            'computer_login_grants_user_code_hash_shape',
            sql`${table.userCodeHash} ~ '^[a-f0-9]{64}$'`
        ),
        check(
            'computer_login_grants_polling_interval_positive',
            sql`${table.pollingIntervalMs} > 0`
        ),
        check(
            'computer_login_grants_status',
            sql`${table.status} in ('pending', 'approved', 'denied', 'expired', 'consumed')`
        ),
        check('computer_login_grants_purpose', sql`${table.purpose} in ('login', 'setup')`),
    ]
);

export const computerLoginSessionsTable = pgTable(
    'computer_login_sessions',
    {
        accessTokenExpiresAt: timestamp('access_token_expires_at', {
            withTimezone: true,
        }).notNull(),
        accessTokenHash: text('access_token_hash').notNull(),
        userId: text('user_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        grantId: text('grant_id')
            .notNull()
            .references(() => computerLoginGrantsTable.id, { onDelete: 'cascade' }),
        id: text('id').primaryKey(),
        origin: text('origin').notNull(),
        refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
            withTimezone: true,
        }).notNull(),
        refreshTokenHash: text('refresh_token_hash').notNull(),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        storedAt: timestamp('stored_at', { withTimezone: true }),
    },
    (table) => [
        uniqueIndex('computer_login_sessions_grant_key').on(table.grantId),
        uniqueIndex('computer_login_sessions_access_token_hash_key').on(table.accessTokenHash),
        uniqueIndex('computer_login_sessions_refresh_token_hash_key').on(table.refreshTokenHash),
        index('computer_login_sessions_owner_idx').on(table.userId, table.createdAt),
        foreignKey({
            columns: [table.userId],
            foreignColumns: [usersTable.id],
            name: 'computer_login_sessions_user_id_fkey',
        }),
        check('computer_login_sessions_id_shape', sql`${table.id} ~ '^cls_[A-Za-z0-9_-]{16}$'`),
        check(
            'computer_login_sessions_access_token_hash_shape',
            sql`${table.accessTokenHash} ~ '^[a-f0-9]{64}$'`
        ),
        check(
            'computer_login_sessions_refresh_token_hash_shape',
            sql`${table.refreshTokenHash} ~ '^[a-f0-9]{64}$'`
        ),
    ]
);

export const computerLoginRefreshTokensTable = pgTable(
    'computer_login_refresh_tokens',
    {
        consumedAt: timestamp('consumed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        sessionId: text('session_id')
            .notNull()
            .references(() => computerLoginSessionsTable.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
    },
    (table) => [
        uniqueIndex('computer_login_refresh_tokens_token_hash_key').on(table.tokenHash),
        index('computer_login_refresh_tokens_session_idx').on(table.sessionId, table.createdAt),
        check(
            'computer_login_refresh_tokens_id_shape',
            sql`${table.id} ~ '^crt_[A-Za-z0-9_-]{16}$'`
        ),
        check(
            'computer_login_refresh_tokens_token_hash_shape',
            sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`
        ),
    ]
);
