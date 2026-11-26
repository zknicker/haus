import type { TaskReportOutcome } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { chatMessagesTable } from './chat-messages.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { tasksTable } from './tasks.ts';

export const taskReportsTable = pgTable(
    'task_reports',
    {
        ask: text('ask'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .default(sql`clock_timestamp()`),
        id: text('id').primaryKey(),
        messageId: text('message_id').notNull(),
        outcome: text('outcome').notNull().$type<TaskReportOutcome>(),
        personUserId: text('person_user_id'),
        runId: text('run_id').notNull(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'task_reports_task_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'task_reports_message_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.personUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'task_reports_person_fk',
        }).onDelete('cascade'),
        index('task_reports_task_idx').on(table.serverId, table.taskId, table.createdAt),
        check('task_reports_outcome', sql`${table.outcome} in ('done', 'needs-you', 'failed')`),
        check(
            'task_reports_person_shape',
            sql`${table.personUserId} is null or ${table.outcome} = 'needs-you'`
        ),
        check(
            'task_reports_ask_length',
            sql`${table.ask} is null or char_length(${table.ask}) between 1 and 8000`
        ),
    ]
);
