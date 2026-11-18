import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';

/**
 * One email-bound, single-use invitation to one Haus server. Only the token's
 * SHA-256 hash is stored, so the raw token exists in exactly one response and
 * nowhere else.
 */
export const serverInvitationsTable = pgTable(
    'server_invitations',
    {
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        acceptedUserId: text('accepted_user_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        email: text('email').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        id: text('id').primaryKey(),
        invitedByUserId: text('invited_by_user_id').notNull(),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
    },
    (table) => [
        uniqueIndex('server_invitations_token_hash_key').on(table.tokenHash),
        uniqueIndex('server_invitations_live_email_key')
            .on(table.serverId, table.email)
            .where(sql`${table.revokedAt} is null and ${table.acceptedAt} is null`),
        index('server_invitations_server_idx').on(table.serverId, table.createdAt),
        foreignKey({
            columns: [table.serverId, table.invitedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'server_invitations_inviter_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.acceptedUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'server_invitations_accepted_membership_fk',
        }),
        check(
            'server_invitations_email_normalized',
            sql`${table.email} = lower(${table.email}) and ${table.email} <> ''`
        ),
        check(
            'server_invitations_terminal',
            sql`(${table.acceptedAt} is null) = (${table.acceptedUserId} is null)
                and not (${table.acceptedAt} is not null and ${table.revokedAt} is not null)`
        ),
    ]
);
