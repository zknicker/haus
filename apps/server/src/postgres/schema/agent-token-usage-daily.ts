import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serversTable } from './servers.ts';

/**
 * Bounded reporting cube maintained from agent_turns by a PostgreSQL trigger.
 * Agent presentation stays normalized and is joined at read time.
 */
export const agentTokenUsageDailyTable = pgTable(
    'agent_token_usage_daily',
    {
        agentId: text('agent_id').notNull(),
        cacheReadTokens: bigint('cache_read_tokens', { mode: 'number' }).notNull().default(0),
        cacheWriteTokens: bigint('cache_write_tokens', { mode: 'number' }).notNull().default(0),
        date: date('date', { mode: 'string' }).notNull(),
        inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
        modelId: text('model_id').notNull(),
        outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
        runtimeId: text('runtime_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
        turnCount: bigint('turn_count', { mode: 'number' }).notNull().default(0),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.date, table.agentId, table.runtimeId, table.modelId],
            name: 'agent_token_usage_daily_pk',
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_token_usage_daily_agent_fk',
        }).onDelete('cascade'),
        check(
            'agent_token_usage_daily_counts',
            sql`
                ${table.cacheReadTokens} >= 0 and
                ${table.cacheWriteTokens} >= 0 and
                ${table.inputTokens} >= 0 and
                ${table.outputTokens} >= 0 and
                ${table.totalTokens} >= 0 and
                ${table.turnCount} > 0
            `
        ),
    ]
);
