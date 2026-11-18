import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from './users.ts';

export const serverDeletionsTable = pgTable(
    'server_deletions',
    {
        completedAt: timestamp('completed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        error: text('error'),
        id: text('id').primaryKey(),
        requestedByUserId: text('requested_by_user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        serverId: text('server_id').notNull(),
        status: text('status').notNull().$type<'completed' | 'failed' | 'pending'>(),
    },
    (table) => [
        index('server_deletions_requester_idx').on(table.requestedByUserId, table.createdAt),
        check('server_deletions_id_shape', sql`${table.id} ~ '^sdl_[A-Za-z0-9_-]{16}$'`),
        check(
            'server_deletions_status',
            sql`${table.status} in ('pending', 'completed', 'failed')`
        ),
    ]
);
