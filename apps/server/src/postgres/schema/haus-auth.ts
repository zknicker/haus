import { sql } from 'drizzle-orm';
import {
    check,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersTable } from './users.ts';

export const userVerifiedEmailsTable = pgTable(
    'user_verified_emails',
    {
        email: text('email').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.email] }),
        uniqueIndex('user_verified_emails_email_key').on(table.email),
        check(
            'user_verified_emails_email_normalized',
            sql`${table.email} = lower(btrim(${table.email}))`
        ),
    ]
);

export const hausSessionsTable = pgTable(
    'haus_sessions',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        identitySubject: text('identity_subject').notNull(),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        resumeTokenHash: text('resume_token_hash').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        uniqueIndex('haus_sessions_resume_token_hash_key').on(table.resumeTokenHash),
        index('haus_sessions_user_created_idx').on(table.userId, table.createdAt),
        index('haus_sessions_identity_subject_idx').on(table.identitySubject),
        check('haus_sessions_id_shape', sql`${table.id} ~ '^has_[A-Za-z0-9_-]{16}$'`),
        check(
            'haus_sessions_resume_token_hash_shape',
            sql`${table.resumeTokenHash} ~ '^[a-f0-9]{64}$'`
        ),
        check('haus_sessions_expiry_order', sql`${table.expiresAt} > ${table.createdAt}`),
        check(
            'haus_sessions_maximum_lifetime',
            sql`${table.expiresAt} <= ${table.createdAt} + interval '14 days'`
        ),
    ]
);

export const hausSessionAccessTokensTable = pgTable(
    'haus_session_access_tokens',
    {
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        sessionId: text('session_id')
            .notNull()
            .references(() => hausSessionsTable.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').primaryKey(),
    },
    (table) => [
        index('haus_session_access_tokens_session_expiry_idx').on(table.sessionId, table.expiresAt),
        check(
            'haus_session_access_tokens_token_hash_shape',
            sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`
        ),
    ]
);

export const browserAuthIntentsTable = pgTable(
    'browser_auth_intents',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        returnTo: text('return_to').notNull(),
        stateHash: text('state_hash').primaryKey(),
    },
    (table) => [
        index('browser_auth_intents_expiry_idx').on(table.expiresAt),
        check('browser_auth_intents_state_hash_shape', sql`${table.stateHash} ~ '^[a-f0-9]{64}$'`),
    ]
);

export const nativeAuthIntentsTable = pgTable(
    'native_auth_intents',
    {
        client: text('client').notNull(),
        codeChallenge: text('code_challenge').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        nativeRedirectUri: text('native_redirect_uri').notNull(),
        nativeState: text('native_state').notNull(),
        stateHash: text('state_hash').primaryKey(),
    },
    (table) => [
        index('native_auth_intents_expiry_idx').on(table.expiresAt),
        check('native_auth_intents_client', sql`${table.client} in ('desktop', 'ios')`),
        check('native_auth_intents_state_hash_shape', sql`${table.stateHash} ~ '^[a-f0-9]{64}$'`),
        check(
            'native_auth_intents_code_challenge_shape',
            sql`${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43}$'`
        ),
    ]
);
