import type { ComputerInventory, ComputerUpdatePhase, UsageOverview } from '@haus/api';
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
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';

export type ComputerHealth = 'degraded' | 'healthy' | 'offline' | 'update-required';

export const computersTable = pgTable(
    'computers',
    {
        architecture: text('architecture'),
        attachedByUserId: text('attached_by_user_id').notNull(),
        attachmentIdempotencyKey: text('attachment_idempotency_key'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        credentialHash: text('credential_hash').notNull(),
        connectionGeneration: text('connection_generation'),
        health: text('health').notNull().default('offline').$type<ComputerHealth>(),
        id: text('id').primaryKey(),
        lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
        operatingSystem: text('operating_system'),
        productVersion: text('product_version'),
        protocolVersion: integer('protocol_version'),
        reportedInventory: bunJsonb('reported_inventory').$type<ComputerInventory>(),
        usageReportedAt: timestamp('usage_reported_at', { withTimezone: true }),
        usageSnapshot: bunJsonb('usage_snapshot').$type<UsageOverview>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updateActiveAgentCount: integer('update_active_agent_count'),
        updateDetail: text('update_detail'),
        updateDownloadedBytes: integer('update_downloaded_bytes'),
        updateFailedPhase:
            text('update_failed_phase').$type<Exclude<ComputerUpdatePhase, 'failed'>>(),
        updatePhase: text('update_phase').notNull().default('idle').$type<ComputerUpdatePhase>(),
        updateTargetVersion: text('update_target_version'),
        updateTotalBytes: integer('update_total_bytes'),
        updateUpdatedAt: timestamp('update_updated_at', { withTimezone: true }),
    },
    (table) => [
        unique('computers_server_id_key').on(table.serverId, table.id),
        uniqueIndex('computers_credential_hash_key').on(table.credentialHash),
        uniqueIndex('computers_attachment_idempotency_key').on(table.attachmentIdempotencyKey),
        index('computers_server_idx').on(table.serverId, table.createdAt),
        foreignKey({
            columns: [table.serverId, table.attachedByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'computers_attacher_membership_fk',
        }),
        check('computers_id_shape', sql`${table.id} ~ '^cmp_[A-Za-z0-9_-]{16}$'`),
        check('computers_credential_hash_shape', sql`${table.credentialHash} ~ '^[a-f0-9]{64}$'`),
        check(
            'computers_connection_generation_shape',
            sql`${table.connectionGeneration} IS NULL OR ${table.connectionGeneration} ~ '^ccn_[A-Za-z0-9_-]{16}$'`
        ),
        check(
            'computers_health',
            sql`${table.health} in ('offline', 'healthy', 'degraded', 'update-required')`
        ),
        check(
            'computers_attachment_idempotency_key_shape',
            sql`${table.attachmentIdempotencyKey} IS NULL OR ${table.attachmentIdempotencyKey} ~ '^cak_[A-Za-z0-9_-]{43}$'`
        ),
        check(
            'computers_update_phase',
            sql`${table.updatePhase} in ('idle', 'checking', 'available', 'requested', 'downloading', 'verifying', 'installing', 'waiting-for-agents', 'restarting', 'complete', 'failed')`
        ),
    ]
);
