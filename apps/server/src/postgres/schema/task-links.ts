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
import { chatMessagesTable } from './chat-messages.ts';
import { remindersTable } from './reminders.ts';
import { tasksTable } from './tasks.ts';

/**
 * One Task reference in a Message, resolved when the Message was written: a
 * `task://` link or a bare key. These rows are the Task's **Mentioned in** and
 * the Message's `taskLinks`; content itself never changes. `text` is the exact
 * matched substring, kept so the App can render a chip over it.
 */
export const taskMessageLinksTable = pgTable(
    'task_message_links',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        messageId: text('message_id').notNull(),
        /** Position among this Message's Task references, in content order. */
        ordinal: integer('ordinal').notNull(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
        text: text('text').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.messageId, table.taskId, table.ordinal] }),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [chatMessagesTable.serverId, chatMessagesTable.id],
            name: 'task_message_links_message_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'task_message_links_task_fk',
        }).onDelete('cascade'),
        index('task_message_links_task_idx').on(table.taskId, table.createdAt.desc()),
        check('task_message_links_ordinal', sql`${table.ordinal} >= 0`),
        check('task_message_links_text_length', sql`char_length(${table.text}) between 1 and 500`),
    ]
);

/** A Reminder whose description references a Task: the Task's **Reminders**. */
export const taskReminderLinksTable = pgTable(
    'task_reminder_links',
    {
        reminderId: text('reminder_id').notNull(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.reminderId, table.taskId] }),
        foreignKey({
            columns: [table.serverId, table.reminderId],
            foreignColumns: [remindersTable.serverId, remindersTable.id],
            name: 'task_reminder_links_reminder_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'task_reminder_links_task_fk',
        }).onDelete('cascade'),
        index('task_reminder_links_task_idx').on(table.taskId),
    ]
);
