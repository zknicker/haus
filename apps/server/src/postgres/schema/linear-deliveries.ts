import type {
    LinearDeliveryIgnoredReason,
    LinearDeliveryState,
    LinearSessionStatus,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { linearIdentitiesTable, linearWorkspacesTable } from './linear.ts';
import { serversTable } from './servers.ts';

// Inbound Linear traffic (specs/linear-app.md#webhooks): durably ingested
// deliveries and the Linear sessions they open.

/**
 * One verified Linear delivery, persisted before the endpoint answers and
 * routed later by the delivery worker. `receiver` is `app` (the Haus app's
 * URL) or an identity id. Unknown organizations are stored `ignored` with no
 * Server.
 */
export const linearWebhookDeliveriesTable = pgTable(
    'linear_webhook_deliveries',
    {
        action: text('action'),
        attempts: integer('attempts').notNull().default(0),
        deliveryId: text('delivery_id').notNull(),
        event: text('event').notNull(),
        id: text('id').primaryKey(),
        ignoredReason: text('ignored_reason').$type<LinearDeliveryIgnoredReason | null>(),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
        organizationId: text('organization_id'),
        processedAt: timestamp('processed_at', { withTimezone: true }),
        projection: bunJsonb('projection').notNull().$type<Record<string, unknown>>(),
        receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
        receiver: text('receiver').notNull(),
        routedCount: integer('routed_count').notNull().default(0),
        serverId: text('server_id').references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().$type<LinearDeliveryState>(),
        webhookTimestamp: timestamp('webhook_timestamp', { withTimezone: true }).notNull(),
        workspaceId: text('workspace_id'),
    },
    (table) => [
        unique('linear_webhook_deliveries_delivery_key').on(table.receiver, table.deliveryId),
        index('linear_webhook_deliveries_queue_idx').on(table.state, table.nextAttemptAt),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_webhook_deliveries_workspace_fk',
        }).onDelete('cascade'),
        check('linear_webhook_deliveries_id_shape', sql`${table.id} ~ '^lnd_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_webhook_deliveries_delivery_id',
            sql`${table.deliveryId} ~ '^[A-Za-z0-9-]{1,64}$'`
        ),
        check(
            'linear_webhook_deliveries_receiver',
            sql`${table.receiver} = 'app' or ${table.receiver} ~ '^lni_[A-Za-z0-9_-]{16}$'`
        ),
        check(
            'linear_webhook_deliveries_state',
            sql`${table.state} in ('queued', 'processing', 'done', 'ignored', 'failed')`
        ),
        check(
            'linear_webhook_deliveries_ignored',
            sql`(${table.state} = 'ignored') = (${table.ignoredReason} is not null)
                and (${table.ignoredReason} is null or ${table.ignoredReason} in (
                    'unknown_workspace', 'workspace_inactive', 'unsupported_event',
                    'team_outside_access'
                ))`
        ),
        check(
            'linear_webhook_deliveries_routing',
            sql`(${table.serverId} is null) = (${table.workspaceId} is null)
                and (${table.serverId} is not null or ${table.state} = 'ignored')`
        ),
        check(
            'linear_webhook_deliveries_processed',
            sql`(${table.state} in ('done', 'ignored', 'failed')) = (${table.processedAt} is not null)`
        ),
        check(
            'linear_webhook_deliveries_projection_size',
            sql`octet_length(${table.projection}::text) <= 65536`
        ),
        check(
            'linear_webhook_deliveries_nonnegative',
            sql`${table.attempts} >= 0 and ${table.routedCount} >= 0`
        ),
    ]
);

/**
 * One Linear agent session, under its Haus handle. `identity_id` names the
 * receiving identity; null means the Haus app received it. `agent_id` is the
 * routed Agent, rewritten on each Haus app event.
 */
export const linearAgentSessionsTable = pgTable(
    'linear_agent_sessions',
    {
        ackedAt: timestamp('acked_at', { withTimezone: true }),
        agentId: text('agent_id'),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        identityId: text('identity_id'),
        issueId: text('issue_id').notNull(),
        issueIdentifier: text('issue_identifier').notNull(),
        lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
        linearSessionId: text('linear_session_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().$type<LinearSessionStatus>(),
        workspaceId: text('workspace_id').notNull(),
    },
    (table) => [
        unique('linear_agent_sessions_linear_session_key').on(
            table.workspaceId,
            table.linearSessionId
        ),
        index('linear_agent_sessions_agent_idx').on(table.serverId, table.agentId, table.status),
        foreignKey({
            columns: [table.serverId, table.workspaceId],
            foreignColumns: [linearWorkspacesTable.serverId, linearWorkspacesTable.id],
            name: 'linear_agent_sessions_workspace_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.workspaceId, table.identityId],
            foreignColumns: [
                linearIdentitiesTable.serverId,
                linearIdentitiesTable.workspaceId,
                linearIdentitiesTable.id,
            ],
            name: 'linear_agent_sessions_identity_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'linear_agent_sessions_agent_fk',
        }),
        check('linear_agent_sessions_id_shape', sql`${table.id} ~ '^lss_[A-Za-z0-9_-]{16}$'`),
        check(
            'linear_agent_sessions_status',
            sql`${table.status} in ('active', 'complete', 'stopped', 'orphaned')`
        ),
        check(
            'linear_agent_sessions_closed',
            sql`(${table.status} = 'active') = (${table.closedAt} is null)`
        ),
    ]
);
