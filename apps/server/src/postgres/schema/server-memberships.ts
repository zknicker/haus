import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { serversTable } from './servers.ts';
import { usersTable } from './users.ts';

/**
 * Standing access of one human to one Haus server, with their Server role.
 * The row is the durable anchor every authored message, read, and DM points at,
 * so revocation sets `revokedAt` and re-acceptance resets the same row into a
 * fresh Member stint stamped with a new `joinedAt` and incremented `stint`.
 */
export const serverMembershipsTable = pgTable(
    'server_memberships',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        handle: text('handle'),
        id: text('id').primaryKey(),
        joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        role: text('role').notNull().$type<'admin' | 'member' | 'owner'>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        stint: integer('stint').notNull().default(1),
        userId: text('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        unique('server_memberships_server_user_key').on(table.serverId, table.userId),
        uniqueIndex('server_memberships_server_handle_key')
            .on(table.serverId, sql`lower(${table.handle})`)
            .where(sql`${table.revokedAt} is null and ${table.handle} is not null`),
        index('server_memberships_user_idx').on(table.userId),
        check('server_memberships_role', sql`${table.role} in ('owner', 'admin', 'member')`),
        check('server_memberships_positive_stint', sql`${table.stint} > 0`),
        check(
            'server_memberships_handle_grammar',
            sql`${table.handle} is null or (${table.handle} ~ '^[a-z0-9][a-z0-9-]{1,30}$' and lower(${table.handle}) not in ('agent', 'agents', 'all', 'busy', 'cove', 'everyone', 'haus', 'here', 'human', 'humans', 'idle', 'system'))`
        ),
    ]
);
