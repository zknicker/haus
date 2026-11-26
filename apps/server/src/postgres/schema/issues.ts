import type { IssuePriority, IssueState } from '@haus/api';
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
    type UpdateDeleteAction,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { projectsTable } from './projects.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';
import { taskKeysTable } from './task-keys.ts';
import { taskLabelsTable } from './task-labels.ts';
import { tasksTable } from './tasks.ts';

export const issuesTable = pgTable(
    'issues',
    {
        assigneeAgentId: text('assignee_agent_id'),
        assigneeTaskId: text('assignee_task_id'),
        assigneeUserId: text('assignee_user_id'),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        creatorAgentId: text('creator_agent_id'),
        creatorTaskId: text('creator_task_id'),
        creatorUserId: text('creator_user_id'),
        description: text('description').notNull().default(''),
        dueOn: date('due_on', { mode: 'string' }),
        id: text('id').primaryKey(),
        keyId: text('key_id').notNull(),
        number: integer('number').notNull(),
        parentId: text('parent_id'),
        priority: text('priority').notNull().default('normal').$type<IssuePriority>(),
        projectId: text('project_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().default('todo').$type<IssueState>(),
        title: text('title').notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        unique('issues_server_id_key').on(table.serverId, table.id),
        unique('issues_server_project_id_key').on(table.serverId, table.projectId, table.id),
        uniqueIndex('issues_key_number_key').on(table.keyId, table.number),
        foreignKey({
            columns: [table.serverId, table.keyId],
            foreignColumns: [taskKeysTable.serverId, taskKeysTable.id],
            name: 'issues_key_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.projectId],
            foreignColumns: [projectsTable.serverId, projectsTable.chatId],
            name: 'issues_project_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.projectId, table.parentId],
            foreignColumns: [table.serverId, table.projectId, table.id],
            name: 'issues_parent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assigneeUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'issues_assignee_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assigneeAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'issues_assignee_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.assigneeTaskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'issues_assignee_task_fk',
        }).onDelete('set null (assignee_task_id)' as UpdateDeleteAction),
        foreignKey({
            columns: [table.serverId, table.creatorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'issues_creator_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.creatorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'issues_creator_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.creatorTaskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'issues_creator_task_fk',
        }),
        check(
            'issues_state',
            sql`${table.state} in ('backlog', 'todo', 'in_progress', 'done', 'canceled')`
        ),
        check(
            'issues_closed_at',
            sql`(${table.closedAt} is not null) = (${table.state} in ('done', 'canceled'))`
        ),
        check('issues_priority', sql`${table.priority} in ('urgent', 'high', 'normal', 'low')`),
        check(
            'issues_assignee_shape',
            sql`num_nonnulls(${table.assigneeUserId}, ${table.assigneeAgentId}, ${table.assigneeTaskId}) <= 1`
        ),
        check(
            'issues_creator_shape',
            sql`num_nonnulls(${table.creatorUserId}, ${table.creatorAgentId}, ${table.creatorTaskId}) = 1`
        ),
        check(
            'issues_parent_not_self',
            sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`
        ),
        check('issues_title_length', sql`char_length(${table.title}) between 1 and 500`),
        check('issues_description_length', sql`char_length(${table.description}) <= 20000`),
        check('issues_positive_number', sql`${table.number} > 0`),
        check('issues_positive_version', sql`${table.version} > 0`),
        index('issues_project_state_idx').on(table.serverId, table.projectId, table.state),
        index('issues_parent_idx')
            .on(table.serverId, table.parentId)
            .where(sql`${table.parentId} is not null`),
        index('issues_assignee_user_idx')
            .on(table.serverId, table.assigneeUserId)
            .where(sql`${table.assigneeUserId} is not null`),
        index('issues_assignee_agent_idx')
            .on(table.serverId, table.assigneeAgentId)
            .where(sql`${table.assigneeAgentId} is not null`),
        index('issues_assignee_task_idx')
            .on(table.serverId, table.assigneeTaskId)
            .where(sql`${table.assigneeTaskId} is not null`),
    ]
);

export const issueLabelAssignmentsTable = pgTable(
    'issue_label_assignments',
    {
        issueId: text('issue_id').notNull(),
        labelId: text('label_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.issueId, table.labelId] }),
        foreignKey({
            columns: [table.serverId, table.issueId],
            foreignColumns: [issuesTable.serverId, issuesTable.id],
            name: 'issue_label_assignments_issue_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.labelId],
            foreignColumns: [taskLabelsTable.serverId, taskLabelsTable.id],
            name: 'issue_label_assignments_label_fk',
        }).onDelete('cascade'),
    ]
);
