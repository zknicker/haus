import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';

import { tasksTable } from './tasks.ts';

export const taskPullRequestsTable = pgTable(
    'task_pull_requests',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        number: integer('number').notNull(),
        repository: text('repository').notNull(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.taskId, table.repository, table.number] }),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'task_pull_requests_task_fk',
        }).onDelete('cascade'),
        index('task_pull_requests_pull_idx').on(table.serverId, table.repository, table.number),
        check('task_pull_requests_number', sql`${table.number} > 0`),
        check(
            'task_pull_requests_repository',
            sql`char_length(${table.repository}) between 3 and 300 and ${table.repository} like '%/%'`
        ),
    ]
);
