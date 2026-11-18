import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';

import { serversTable } from './servers.ts';

export const taskKeysTable = pgTable(
    'task_keys',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        key: text('key').notNull(),
        nextNumber: integer('next_number').notNull().default(1),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        unique('task_keys_server_id_key').on(table.serverId, table.id),
        uniqueIndex('task_keys_server_key_key').on(table.serverId, table.key),
        check('task_keys_key_format', sql`${table.key} ~ '^[A-Z][A-Z0-9]{1,4}$'`),
        check('task_keys_next_number', sql`${table.nextNumber} >= 1`),
    ]
);
