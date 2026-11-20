import type {
    ModelConnectionAuthKind,
    ModelConnectionCapacityWindow,
    ModelConnectionStatus,
    ModelProvider,
} from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

export const modelConnectionsTable = pgTable(
    'model_connections',
    {
        authKind: text('auth_kind').notNull().$type<ModelConnectionAuthKind>(),
        capacity: bunJsonb('capacity').$type<ModelConnectionCapacityWindow[]>(),
        capacityReadAt: timestamp('capacity_read_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        credentialVersion: integer('credential_version').notNull().default(1),
        enabled: boolean('enabled').notNull().default(true),
        id: text('id').primaryKey(),
        label: text('label').notNull(),
        position: integer('position').notNull(),
        provider: text('provider').notNull().$type<ModelProvider>(),
        sealedCredential: bunJsonb('sealed_credential').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        status: text('status').notNull().default('ready').$type<ModelConnectionStatus>(),
        statusDetail: text('status_detail'),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        webSearch: boolean('web_search').notNull().default(true),
    },
    (table) => [
        unique('model_connections_server_id_key').on(table.serverId, table.id),
        unique('model_connections_label_key').on(table.serverId, table.provider, table.label),
        index('model_connections_order_idx').on(table.serverId, table.provider, table.position),
        check(
            'model_connections_provider',
            sql`${table.provider} in ('claude', 'chatgpt', 'xai', 'gemini', 'openrouter')`
        ),
        check(
            'model_connections_auth_kind',
            sql`(${table.provider} = 'claude' and ${table.authKind} = 'setup-token')
                or (${table.provider} = 'chatgpt' and ${table.authKind} = 'oauth')
                or (${table.provider} = 'xai' and ${table.authKind} in ('oauth', 'api-key'))
                or (${table.provider} in ('gemini', 'openrouter') and ${table.authKind} = 'api-key')`
        ),
        check('model_connections_status', sql`${table.status} in ('ready', 'failed')`),
        check('model_connections_position', sql`${table.position} >= 0`),
        check('model_connections_label_length', sql`char_length(${table.label}) between 1 and 80`),
    ]
);
