import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from './users.ts';

/**
 * One iPhone's APNs registration for one human. The token is the identity: a
 * token registered again by another human moves to them. APNs rejecting the
 * token as gone deletes the row; any other refusal lands in `last_error`.
 */
export const pushDevicesTable = pgTable(
    'push_devices',
    {
        bundleId: text('bundle_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        environment: text('environment').notNull().$type<'production' | 'sandbox'>(),
        lastError: text('last_error'),
        token: text('token').primaryKey(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        userId: text('user_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        index('push_devices_user_idx').on(table.userId),
        check('push_devices_environment', sql`${table.environment} in ('sandbox', 'production')`),
    ]
);
