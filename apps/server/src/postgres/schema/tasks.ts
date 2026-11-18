import type { TaskState } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    date,
    foreignKey,
    index,
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';
import { taskKeysTable } from './task-keys.ts';
import { taskLabelsTable } from './task-labels.ts';

/**
 * A Task (ADR 0053): a place for one piece of work. Its key (`SEC-12`) is its
 * key-ledger entry's key and `number`, derived when read and never stored.
 * There is no deletion; `completed_at` is set exactly while `state` is `done`
 * or `canceled`.
 */
export const tasksTable = pgTable(
    'tasks',
    {
        assigneeAgentId: text('assignee_agent_id'),
        assigneeUserId: text('assignee_user_id'),
        /**
         * The Task's own `task` Chat (ADR 0053), one per Task. Null for a Task
         * from before Tasks were places that 0127 archived as read-only history.
         */
        chatId: text('chat_id'),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        createdByAgentId: text('created_by_agent_id'),
        createdByUserId: text('created_by_user_id'),
        description: text('description').notNull().default(''),
        /** Display only: it sorts and badges, and wakes nothing. */
        dueOn: date('due_on', { mode: 'string' }),
        id: text('id').primaryKey(),
        /** The key-ledger entry numbering this Task; it advances `task_keys.next_number`. */
        keyId: text('key_id').notNull(),
        number: integer('number').notNull(),
        priority: text('priority')
            .notNull()
            .default('none')
            .$type<'none' | 'urgent' | 'high' | 'medium' | 'low'>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        /** ADR 0053's Task state, the only source of truth for it. */
        state: text('state').notNull().default('todo').$type<TaskState>(),
        title: text('title').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        unique('tasks_server_id_key').on(table.serverId, table.id),
        uniqueIndex('tasks_key_number_key').on(table.keyId, table.number),
        uniqueIndex('tasks_chat_key').on(table.chatId),
        // Not cascade: a Task's Chat goes only with its Server, and 0124 defers
        // this check to commit so a Server purge removes both together.
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'tasks_chat_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.keyId],
            foreignColumns: [taskKeysTable.serverId, taskKeysTable.id],
            name: 'tasks_key_fk',
        }),
        check('tasks_state', sql`${table.state} in ('todo', 'open', 'done', 'canceled')`),
        check(
            'tasks_completed_at',
            sql`(${table.completedAt} is not null) = (${table.state} in ('done', 'canceled'))`
        ),
        foreignKey({
            columns: [table.serverId, table.assigneeUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'tasks_assignee_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assigneeAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'tasks_assignee_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'tasks_creator_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'tasks_creator_agent_fk',
        }),
        check(
            'tasks_assignee_shape',
            sql`num_nonnulls(${table.assigneeUserId}, ${table.assigneeAgentId}) <= 1`
        ),
        check(
            'tasks_creator_shape',
            sql`num_nonnulls(${table.createdByUserId}, ${table.createdByAgentId}) = 1`
        ),
        check(
            'tasks_priority',
            sql`${table.priority} in ('none', 'urgent', 'high', 'medium', 'low')`
        ),
        check('tasks_title_length', sql`char_length(${table.title}) between 1 and 200`),
        check('tasks_description_length', sql`char_length(${table.description}) <= 20000`),
        check('tasks_positive_number', sql`${table.number} > 0`),
        check('tasks_positive_version', sql`${table.version} > 0`),
        index('tasks_state_idx').on(table.serverId, table.state),
        index('tasks_assignee_user_idx')
            .on(table.serverId, table.assigneeUserId)
            .where(sql`${table.assigneeUserId} is not null`),
        index('tasks_assignee_agent_idx')
            .on(table.serverId, table.assigneeAgentId)
            .where(sql`${table.assigneeAgentId} is not null`),
    ]
);

/** A Task's labels, from the Server's shared task label catalog. */
export const taskLabelAssignmentsTable = pgTable(
    'task_label_assignments',
    {
        labelId: text('label_id').notNull(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.taskId, table.labelId] }),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'task_label_assignments_task_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.labelId],
            foreignColumns: [taskLabelsTable.serverId, taskLabelsTable.id],
            name: 'task_label_assignments_label_fk',
        }).onDelete('cascade'),
    ]
);
