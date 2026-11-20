import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core';
import { computersTable } from './computers.ts';
import { projectsTable } from './projects.ts';
import { serverMembershipsTable } from './server-memberships.ts';

export const projectReposTable = pgTable(
    'project_repos',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        projectId: text('project_id').notNull(),
        repository: text('repository').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        unique('project_repos_server_id_key').on(table.serverId, table.id),
        unique('project_repos_repository_key').on(
            table.serverId,
            table.projectId,
            table.repository
        ),
        foreignKey({
            columns: [table.serverId, table.projectId],
            foreignColumns: [projectsTable.serverId, projectsTable.chatId],
            name: 'project_repos_project_fk',
        }).onDelete('cascade'),
        check('project_repos_id_shape', sql`${table.id} ~ '^prp_[A-Za-z0-9_-]{16}$'`),
        check(
            'project_repos_repository_shape',
            sql`${table.repository} ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'
                and char_length(${table.repository}) <= 200`
        ),
    ]
);

export const projectRepoLinksTable = pgTable(
    'project_repo_links',
    {
        checkoutPath: text('checkout_path'),
        computerId: text('computer_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        linkedByUserId: text('linked_by_user_id').notNull(),
        projectRepoId: text('project_repo_id').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.projectRepoId, table.computerId],
            name: 'project_repo_links_pkey',
        }),
        foreignKey({
            columns: [table.serverId, table.projectRepoId],
            foreignColumns: [projectReposTable.serverId, projectReposTable.id],
            name: 'project_repo_links_repo_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'project_repo_links_computer_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.linkedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'project_repo_links_linker_membership_fk',
        }),
        check(
            'project_repo_links_checkout_path_shape',
            sql`${table.checkoutPath} is null
                or char_length(${table.checkoutPath}) between 1 and 1024`
        ),
    ]
);
