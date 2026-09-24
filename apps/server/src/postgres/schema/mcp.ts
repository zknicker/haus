import type { McpIcon } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

export const mcpConnectionsTable = pgTable(
    'mcp_connections',
    {
        accountLabel: text('account_label'),
        auth: text('auth').notNull().$type<'headers' | 'none' | 'oauth'>(),
        connected: boolean('connected').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        headerNames: text('header_names').array().notNull(),
        icon: bunJsonb('icon').$type<McpIcon | null>(),
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        preset: text('preset').$type<'google-calendar' | 'merchbase' | 'rankwrangler' | null>(),
        summary: text('summary'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        tools: text('tools').array().notNull(),
        url: text('url').notNull(),
    },
    (table) => [
        unique('mcp_connections_server_id_key').on(table.serverId, table.id),
        check('mcp_connections_id_shape', sql`${table.id} ~ '^mcp_[A-Za-z0-9_-]{16}$'`),
        check('mcp_connections_auth', sql`${table.auth} in ('none', 'headers', 'oauth')`),
        check(
            'mcp_connections_preset',
            sql`${table.preset} is null or ${table.preset} in ('google-calendar', 'merchbase', 'rankwrangler')`
        ),
    ]
);

export const mcpSecretsTable = pgTable('mcp_secrets', {
    connectionId: text('connection_id')
        .primaryKey()
        .references(() => mcpConnectionsTable.id, { onDelete: 'cascade' }),
    secret: bunJsonb('secret').notNull().$type<Record<string, unknown>>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agentMcpConnectionGrantsTable = pgTable(
    'agent_mcp_connection_grants',
    {
        agentId: text('agent_id').notNull(),
        connectionId: text('connection_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.agentId, table.connectionId],
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_mcp_connection_grants_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.connectionId],
            foreignColumns: [mcpConnectionsTable.serverId, mcpConnectionsTable.id],
            name: 'agent_mcp_connection_grants_connection_fk',
        }).onDelete('cascade'),
    ]
);
