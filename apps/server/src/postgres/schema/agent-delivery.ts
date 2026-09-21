import type { AgentReasoningEffort } from '@haus/api';
import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serversTable } from './servers.ts';

/**
 * Durable per-Agent delivery state: the human Stop flag plus the single
 * in-flight run. Serialization is per Agent — one row, one active run — so
 * different Agents on one Computer run concurrently without a Computer-wide
 * queue. `acceptedAt` records the Computer's local-acceptance ack; a null
 * `acceptedAt` on an active run is what the retry sweep resends.
 */
export const agentDeliveryTable = pgTable(
    'agent_delivery',
    {
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),
        activeRunChatId: text('active_run_chat_id'),
        activeRunComputerId: text('active_run_computer_id'),
        activeRunId: text('active_run_id'),
        activeRunModelId: text('active_run_model_id'),
        activeRunReasoningEffort: text('active_run_reasoning_effort').$type<AgentReasoningEffort>(),
        activeRunRuntimeId: text('active_run_runtime_id'),
        agentChainTurns: integer('agent_chain_turns').notNull().default(0),
        agentId: text('agent_id').primaryKey(),
        consecutiveFailures: integer('consecutive_failures').notNull().default(0),
        dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
        retryAfter: timestamp('retry_after', { withTimezone: true }),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        stopped: boolean('stopped').notNull().default(false),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_delivery_agent_fk',
        }).onDelete('cascade'),
        check('agent_delivery_nonnegative_chain_turns', sql`${table.agentChainTurns} >= 0`),
        check('agent_delivery_nonnegative_failures', sql`${table.consecutiveFailures} >= 0`),
        check(
            'agent_delivery_active_run',
            sql`(
                ${table.activeRunId} is null
                and ${table.activeRunChatId} is null
                and ${table.activeRunComputerId} is null
                and ${table.activeRunRuntimeId} is null
                and ${table.activeRunModelId} is null
                and ${table.activeRunReasoningEffort} is null
                and ${table.acceptedAt} is null
                and ${table.dispatchedAt} is null
            ) or (
                ${table.activeRunId} is not null
                and ${table.activeRunChatId} is not null
                and ${table.activeRunComputerId} is not null
                and ${table.activeRunRuntimeId} is not null
                and ${table.activeRunModelId} is not null
                and ${table.activeRunReasoningEffort} is not null
            )`
        ),
        check(
            'agent_delivery_active_run_reasoning_effort',
            sql`${table.activeRunReasoningEffort} is null or ${table.activeRunReasoningEffort} in ('default', 'low', 'medium', 'high', 'xhigh', 'max')`
        ),
    ]
);
