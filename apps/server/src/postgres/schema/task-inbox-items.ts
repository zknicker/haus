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
import { agentsTable } from './agents.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { tasksTable } from './tasks.ts';

/**
 * A Task assigned to a person, as their Inbox item (ADR 0051): one row per
 * (person, Task). Assignment upserts it and resets `cleared_at`; reassigning
 * away deletes it. Self-assignment writes none.
 */
export const taskInboxItemsTable = pgTable(
    'task_inbox_items',
    {
        assignedByAgentId: text('assigned_by_agent_id'),
        assignedByUserId: text('assigned_by_user_id'),
        /** The Task version the assignment produced. */
        assignmentVersion: integer('assignment_version').notNull(),
        clearedAt: timestamp('cleared_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.taskId] }),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'task_inbox_items_task_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.userId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'task_inbox_items_membership_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.assignedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'task_inbox_items_assigner_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assignedByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'task_inbox_items_assigner_agent_fk',
        }),
        check(
            'task_inbox_items_assigner_shape',
            sql`num_nonnulls(${table.assignedByUserId}, ${table.assignedByAgentId}) = 1`
        ),
        check('task_inbox_items_assignment_version', sql`${table.assignmentVersion} > 0`),
        index('task_inbox_items_uncleared_idx')
            .on(table.serverId, table.userId)
            .where(sql`${table.clearedAt} is null`),
    ]
);
