import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { computersTable } from './computers.ts';
import { serversTable } from './servers.ts';

/**
 * Compact turn activity reported by a Computer after a launch settles. Durable
 * collaboration and this summary live Server-side; the raw transcript, logs,
 * and workspace stay Computer-local behind the authorized live relay.
 */
export const agentTurnsTable = pgTable(
    'agent_turns',
    {
        activity: bunJsonb('activity').notNull().default(sql`'{"operations":[]}'::jsonb`),
        agentId: text('agent_id').notNull(),
        computerId: text('computer_id').notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
        /** The Computer's failure classification for a failed turn. */
        failureKind: text('failure_kind'),
        id: text('id').primaryKey(),
        messageCount: integer('message_count').notNull().default(0),
        modelId: text('model_id'),
        /** Whether the turn produced model-visible output (any durable send). */
        outputProduced: boolean('output_produced').notNull().default(false),
        reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
        runId: text('run_id').notNull(),
        runtimeId: text('runtime_id'),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
        status: text('status').notNull().$type<'completed' | 'failed' | 'interrupted'>(),
        summary: text('summary').notNull(),
        cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
        cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
        inputTokens: integer('input_tokens').notNull().default(0),
        outputTokens: integer('output_tokens').notNull().default(0),
        tokenUsageReported: boolean('token_usage_reported').notNull().default(false),
        totalTokens: integer('total_tokens').notNull().default(0),
    },
    (table) => [
        uniqueIndex('agent_turns_run_key').on(table.serverId, table.agentId, table.runId),
        index('agent_turns_agent_idx').on(table.serverId, table.agentId, table.reportedAt),
        // Serves agent.serverTurns' newest-first (startedAt, runId) keyset pages by
        // backward scan; ascending matches `ORDER BY ... DESC` (NULLS FIRST) exactly.
        index('agent_turns_server_started_idx').on(table.serverId, table.startedAt, table.runId),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_turns_agent_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'agent_turns_computer_fk',
        }).onDelete('cascade'),
        check('agent_turns_status', sql`${table.status} in ('completed', 'failed', 'interrupted')`),
        check('agent_turns_message_count', sql`${table.messageCount} >= 0`),
        check(
            'agent_turns_token_counts',
            sql`
            ${table.cacheReadTokens} >= 0 and
            ${table.cacheWriteTokens} >= 0 and
            ${table.inputTokens} >= 0 and
            ${table.outputTokens} >= 0 and
            ${table.totalTokens} >= 0
        `
        ),
        check('agent_turns_id_shape', sql`${table.id} ~ '^atn_[A-Za-z0-9_-]{16}$'`),
    ]
);
