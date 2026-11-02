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
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatMessagesTable } from './chat-messages.ts';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { taskLabelsTable } from './task-labels.ts';

export const messageTasksTable = pgTable(
    'message_tasks',
    {
        /** Tasks are Agent work (ADR 0037): only an Agent ever holds one. */
        assigneeAgentId: text('assignee_agent_id'),
        /**
         * The task's top-level Channel or DM: it owns the task number, the
         * assignee pool, and access. A task on a Thread message still names its
         * parent here and records the Thread in `threadChatId`.
         */
        chatId: text('chat_id').notNull(),
        claimedAt: timestamp('claimed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        createdByAgentId: text('created_by_agent_id'),
        createdByUserId: text('created_by_user_id'),
        /** The Chat the task's message lives in: its Thread, or its top-level Chat. */
        messageChatId: text('message_chat_id')
            .notNull()
            .generatedAlwaysAs(sql`coalesce(thread_chat_id, chat_id)`),
        messageId: text('message_id').notNull(),
        number: integer('number').notNull(),
        origin: text('origin').notNull().$type<'claimed' | 'composed' | 'converted'>(),
        priority: text('priority')
            .notNull()
            .default('none')
            .$type<'none' | 'urgent' | 'high' | 'medium' | 'low'>(),
        serverId: text('server_id').notNull(),
        status: text('status')
            .notNull()
            .default('todo')
            .$type<'todo' | 'in_progress' | 'in_review' | 'done' | 'closed'>(),
        /**
         * The Thread the task's message was posted in, which is also its work
         * surface; null for a task on a top-level message, whose work surface is
         * the Thread anchored on it (ADR 0015).
         */
        threadChatId: text('thread_chat_id'),
        /**
         * When this task stopped being a background claim for a reason its
         * current row cannot show: the Agent asked for review, or its claiming
         * run settled with the work unfinished. Tier is otherwise derived, so
         * this one stamp is all that has to survive.
         */
        trackedAt: timestamp('tracked_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.messageId] }),
        uniqueIndex('message_tasks_chat_number_key').on(table.serverId, table.chatId, table.number),
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'message_tasks_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.messageChatId, table.messageId],
            foreignColumns: [
                chatMessagesTable.serverId,
                chatMessagesTable.chatId,
                chatMessagesTable.id,
            ],
            name: 'message_tasks_message_fk',
        }).onDelete('cascade'),
        // A Thread task's Thread must be a child of the task's own Chat.
        foreignKey({
            columns: [table.serverId, table.threadChatId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id, chatsTable.parentChatId],
            name: 'message_tasks_thread_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.createdByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'message_tasks_creator_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'message_tasks_creator_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assigneeAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'message_tasks_assignee_agent_fk',
        }),
        check(
            'message_tasks_creator_shape',
            sql`num_nonnulls(${table.createdByUserId}, ${table.createdByAgentId}) = 1`
        ),
        check('message_tasks_positive_number', sql`${table.number} > 0`),
        check('message_tasks_positive_version', sql`${table.version} > 0`),
        check(
            'message_tasks_status',
            sql`${table.status} in ('todo', 'in_progress', 'in_review', 'done', 'closed')`
        ),
        check(
            'message_tasks_priority',
            sql`${table.priority} in ('none', 'urgent', 'high', 'medium', 'low')`
        ),
        check('message_tasks_origin', sql`${table.origin} in ('claimed', 'composed', 'converted')`),
        check(
            'message_tasks_claim_shape',
            sql`${table.claimedAt} is null or ${table.assigneeAgentId} is not null`
        ),
        index('message_tasks_chat_status_idx').on(table.serverId, table.chatId, table.status),
        // Every Agent turn settles by asking for that Agent's open claims. The
        // predicate is the settle query's, so the index stays proportional to
        // live claims rather than to task history.
        index('message_tasks_open_claim_idx')
            .on(table.serverId, table.assigneeAgentId)
            .where(sql`${table.origin} = 'claimed' and ${table.trackedAt} is null`),
    ]
);

export const messageTaskLabelsTable = pgTable(
    'message_task_labels',
    {
        labelId: text('label_id').notNull(),
        messageId: text('message_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.messageId, table.labelId] }),
        foreignKey({
            columns: [table.serverId, table.messageId],
            foreignColumns: [messageTasksTable.serverId, messageTasksTable.messageId],
            name: 'message_task_labels_task_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.labelId],
            foreignColumns: [taskLabelsTable.serverId, taskLabelsTable.id],
            name: 'message_task_labels_label_fk',
        }).onDelete('cascade'),
    ]
);
