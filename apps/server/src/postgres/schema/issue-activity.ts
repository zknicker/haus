import type { IssueChange, IssueEventKind } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
    type UpdateDeleteAction,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { issuesTable } from './issues.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { tasksTable } from './tasks.ts';

export const issueCommentsTable = pgTable(
    'issue_comments',
    {
        authorAgentId: text('author_agent_id'),
        authorTaskId: text('author_task_id'),
        authorUserId: text('author_user_id'),
        body: text('body').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .default(sql`clock_timestamp()`),
        editedAt: timestamp('edited_at', { withTimezone: true }),
        id: text('id').primaryKey(),
        issueId: text('issue_id').notNull(),
        parentCommentId: text('parent_comment_id'),
        replyToCommentId: text('reply_to_comment_id'),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.issueId],
            foreignColumns: [issuesTable.serverId, issuesTable.id],
            name: 'issue_comments_issue_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.parentCommentId],
            foreignColumns: [table.id],
            name: 'issue_comments_parent_fk',
        }),
        foreignKey({
            columns: [table.replyToCommentId],
            foreignColumns: [table.id],
            name: 'issue_comments_reply_to_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.authorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'issue_comments_author_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.authorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'issue_comments_author_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.authorTaskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'issue_comments_author_task_fk',
        }).onDelete('cascade'),
        check(
            'issue_comments_author_shape',
            sql`num_nonnulls(${table.authorUserId}, ${table.authorAgentId}, ${table.authorTaskId}) = 1`
        ),
        check(
            'issue_comments_reply_shape',
            sql`(${table.parentCommentId} is null) = (${table.replyToCommentId} is null)`
        ),
        check('issue_comments_body_length', sql`char_length(${table.body}) between 1 and 20000`),
        index('issue_comments_issue_idx').on(table.issueId, table.createdAt),
    ]
);

export const issueEventsTable = pgTable(
    'issue_events',
    {
        actorAgentId: text('actor_agent_id'),
        actorTaskId: text('actor_task_id'),
        actorUserId: text('actor_user_id'),
        change: bunJsonb('change').notNull().$type<IssueChange>(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .default(sql`clock_timestamp()`),
        id: text('id').primaryKey(),
        issueId: text('issue_id').notNull(),
        kind: text('kind').notNull().$type<IssueEventKind>(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.issueId],
            foreignColumns: [issuesTable.serverId, issuesTable.id],
            name: 'issue_events_issue_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.actorUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'issue_events_actor_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.actorAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'issue_events_actor_agent_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.actorTaskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'issue_events_actor_task_fk',
        }).onDelete('set null (actor_task_id)' as UpdateDeleteAction),
        check(
            'issue_events_actor_shape',
            sql`num_nonnulls(${table.actorUserId}, ${table.actorAgentId}, ${table.actorTaskId}) <= 1`
        ),
        check('issue_events_kind_matches', sql`${table.change} ->> 'kind' = ${table.kind}`),
        index('issue_events_issue_idx').on(table.issueId, table.createdAt),
    ]
);

export const issueTaskLinksTable = pgTable(
    'issue_task_links',
    {
        issueId: text('issue_id').notNull(),
        linkedAt: timestamp('linked_at', { withTimezone: true })
            .notNull()
            .default(sql`clock_timestamp()`),
        linkedByAgentId: text('linked_by_agent_id'),
        linkedByTaskId: text('linked_by_task_id'),
        linkedByUserId: text('linked_by_user_id'),
        serverId: text('server_id').notNull(),
        taskId: text('task_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.issueId, table.taskId] }),
        foreignKey({
            columns: [table.serverId, table.issueId],
            foreignColumns: [issuesTable.serverId, issuesTable.id],
            name: 'issue_task_links_issue_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.taskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'issue_task_links_task_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.linkedByTaskId],
            foreignColumns: [tasksTable.serverId, tasksTable.id],
            name: 'issue_task_links_linked_by_task_fk',
        }).onDelete('set null (linked_by_task_id)' as UpdateDeleteAction),
        check(
            'issue_task_links_linked_by_shape',
            sql`num_nonnulls(${table.linkedByUserId}, ${table.linkedByAgentId}, ${table.linkedByTaskId}) <= 1`
        ),
        index('issue_task_links_task_idx').on(table.serverId, table.taskId),
    ]
);

export const issueSubscriptionsTable = pgTable(
    'issue_subscriptions',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        issueId: text('issue_id').notNull(),
        serverId: text('server_id').notNull(),
        userId: text('user_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.issueId, table.userId] }),
        foreignKey({
            columns: [table.serverId, table.issueId],
            foreignColumns: [issuesTable.serverId, issuesTable.id],
            name: 'issue_subscriptions_issue_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.userId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'issue_subscriptions_membership_fk',
        }).onDelete('cascade'),
        index('issue_subscriptions_user_idx').on(table.serverId, table.userId),
    ]
);
