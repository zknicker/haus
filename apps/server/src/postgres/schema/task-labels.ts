import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { serversTable } from './servers.ts';

export const taskLabelsTable = pgTable(
    'task_labels',
    {
        color: text('color')
            .notNull()
            .$type<
                'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'gray'
            >(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').notNull(),
        name: text('name').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.id] }),
        uniqueIndex('task_labels_server_name_key').on(table.serverId, sql`lower(${table.name})`),
        check(
            'task_labels_color',
            sql`${table.color} in ('red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink', 'gray')`
        ),
    ]
);
