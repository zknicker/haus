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
import { serverMembershipsTable } from './server-memberships.ts';

export const reposTable = pgTable(
    'repos',
    {
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        repository: text('repository').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.repository], name: 'repos_pkey' }),
        check(
            'repos_repository_shape',
            sql`${table.repository} ~ '^[a-z0-9._-]+/[a-z0-9._-]+$'
                and char_length(${table.repository}) <= 200`
        ),
    ]
);

export const repoFoldersTable = pgTable(
    'repo_folders',
    {
        addedByUserId: text('added_by_user_id'),
        computerId: text('computer_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        path: text('path').notNull(),
        repository: text('repository').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.computerId, table.repository],
            name: 'repo_folders_pkey',
        }),
        unique('repo_folders_path_key').on(table.serverId, table.computerId, table.path),
        foreignKey({
            columns: [table.serverId, table.repository],
            foreignColumns: [reposTable.serverId, reposTable.repository],
            name: 'repo_folders_repo_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'repo_folders_computer_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.addedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'repo_folders_adder_membership_fk',
        }),
        check(
            'repo_folders_path_shape',
            sql`${table.path} like '/%' and char_length(${table.path}) between 2 and 1024`
        ),
    ]
);
