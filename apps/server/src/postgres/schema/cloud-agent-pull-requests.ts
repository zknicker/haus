import type { CloudAgentPullRequestReading, CloudAgentPullRequestState } from '@haus/api';
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

/**
 * The Server's live reading of each pull request some Cloud Agent work
 * reported (specs/open-threads.md). A row is evidence, not a Haus lifecycle.
 * `refresh_requested_at` marks a row a webhook or a new report made stale; the
 * refresher reads GitHub and clears it. Rows for other pull requests never exist.
 */
export const cloudAgentPullRequestsTable = pgTable(
    'cloud_agent_pull_requests',
    {
        additions: integer('additions').notNull(),
        changedFiles: integer('changed_files').notNull(),
        checks: text('checks')
            .notNull()
            .default('unknown')
            .$type<CloudAgentPullRequestReading['checks']>(),
        deletions: integer('deletions').notNull(),
        headSha: text('head_sha'),
        number: integer('number').notNull(),
        observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
        refreshRequestedAt: timestamp('refresh_requested_at', { withTimezone: true }),
        /** `owner/name`, lower-cased, as `parseGithubPullRequestUrl` reads it. */
        repository: text('repository').notNull(),
        review: text('review')
            .notNull()
            .default('unknown')
            .$type<CloudAgentPullRequestReading['review']>(),
        serverId: text('server_id').notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
        source: text('source').notNull().$type<CloudAgentPullRequestReading['source']>(),
        state: text('state').notNull().$type<CloudAgentPullRequestState>(),
        title: text('title'),
        url: text('url').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.repository, table.number],
            name: 'cloud_agent_pull_requests_pkey',
        }),
        foreignKey({
            columns: [table.serverId],
            foreignColumns: [serversTable.id],
            name: 'cloud_agent_pull_requests_server_fk',
        }).onDelete('cascade'),
        index('cloud_agent_pull_requests_head_idx').on(
            table.serverId,
            table.repository,
            table.headSha
        ),
        index('cloud_agent_pull_requests_refresh_idx')
            .on(table.refreshRequestedAt)
            .where(sql`${table.refreshRequestedAt} is not null`),
        check(
            'cloud_agent_pull_requests_checks_check',
            sql`${table.checks} in ('none', 'pending', 'passing', 'failing', 'unknown')`
        ),
        check(
            'cloud_agent_pull_requests_review_check',
            sql`${table.review} in ('none', 'approved', 'changes-requested', 'unknown')`
        ),
        check(
            'cloud_agent_pull_requests_source_check',
            sql`${table.source} in ('computer', 'github')`
        ),
        check(
            'cloud_agent_pull_requests_state_check',
            sql`${table.state} in ('draft', 'open', 'merged', 'closed')`
        ),
    ]
);
