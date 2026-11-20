import type { PullRequestReading, WorkerPullRequestState } from '@haus/api';
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
import { serversTable } from './servers.ts';

export const pullRequestReadingsTable = pgTable(
    'pull_request_readings',
    {
        additions: integer('additions').notNull(),
        changedFiles: integer('changed_files').notNull(),
        checks: text('checks').notNull().default('unknown').$type<PullRequestReading['checks']>(),
        deletions: integer('deletions').notNull(),
        headSha: text('head_sha'),
        number: integer('number').notNull(),
        observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
        refreshRequestedAt: timestamp('refresh_requested_at', { withTimezone: true }),
        /** `owner/name`, lower-cased, as `parseGithubPullRequestUrl` reads it. */
        repository: text('repository').notNull(),
        review: text('review').notNull().default('unknown').$type<PullRequestReading['review']>(),
        serverId: text('server_id').notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
        source: text('source').notNull().$type<PullRequestReading['source']>(),
        state: text('state').notNull().$type<WorkerPullRequestState>(),
        title: text('title'),
        url: text('url').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.repository, table.number],
            name: 'pull_request_readings_pkey',
        }),
        foreignKey({
            columns: [table.serverId],
            foreignColumns: [serversTable.id],
            name: 'pull_request_readings_server_fk',
        }).onDelete('cascade'),
        index('pull_request_readings_head_idx').on(table.serverId, table.repository, table.headSha),
        index('pull_request_readings_refresh_idx')
            .on(table.refreshRequestedAt)
            .where(sql`${table.refreshRequestedAt} is not null`),
        check(
            'pull_request_readings_checks_check',
            sql`${table.checks} in ('none', 'pending', 'passing', 'failing', 'unknown')`
        ),
        check(
            'pull_request_readings_review_check',
            sql`${table.review} in ('none', 'approved', 'changes-requested', 'unknown')`
        ),
        check('pull_request_readings_source_check', sql`${table.source} in ('computer', 'github')`),
        check(
            'pull_request_readings_state_check',
            sql`${table.state} in ('draft', 'open', 'merged', 'closed')`
        ),
    ]
);
