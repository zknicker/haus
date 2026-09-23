import type { AgentActivityCategory, AgentActivityPhase, AgentActivityProducer } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
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
import { serversTable } from './servers.ts';

/**
 * Safe semantic activity only. Evidence stays on the Computer; this table is
 * the durable, Server-ordered projection that clients may show to members.
 */
export const agentActivityTable = pgTable(
    'agent_activity',
    {
        agentId: text('agent_id').notNull(),
        category: text('category').notNull().$type<AgentActivityCategory>(),
        id: text('id').primaryKey(),
        occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
        phase: text('phase').notNull().$type<AgentActivityPhase>(),
        position: integer('position').notNull(),
        producer: text('producer').notNull().$type<AgentActivityProducer>(),
        producerId: text('producer_id').notNull(),
        producerSequence: integer('producer_sequence').notNull(),
        recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
        runOrder: integer('run_order').notNull(),
        runId: text('run_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        toolRef: text('tool_ref'),
    },
    (table) => [
        uniqueIndex('agent_activity_idempotency_key').on(
            table.serverId,
            table.agentId,
            table.runId,
            table.producer,
            table.producerId,
            table.producerSequence
        ),
        uniqueIndex('agent_activity_position_key').on(
            table.serverId,
            table.agentId,
            table.runId,
            table.position
        ),
        index('agent_activity_agent_idx').on(table.serverId, table.agentId, table.recordedAt),
        index('agent_activity_run_position_idx').on(
            table.serverId,
            table.agentId,
            table.runId,
            table.position
        ),
        index('agent_activity_run_order_idx').on(
            table.serverId,
            table.agentId,
            table.runOrder,
            table.position
        ),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_activity_agent_fk',
        }).onDelete('cascade'),
        check(
            'agent_activity_category',
            sql`${table.category} in ('starting_work', 'updating_instructions', 'checking_messages', 'received_message', 'thinking', 'browsing', 'searching_web', 'reading_files', 'editing_files', 'running_command', 'using_tool', 'sending_message', 'working')`
        ),
        check(
            'agent_activity_phase',
            sql`${table.phase} in ('started', 'completed', 'failed', 'interrupted')`
        ),
        check('agent_activity_producer', sql`${table.producer} in ('server', 'computer')`),
        check('agent_activity_positive_position', sql`${table.position} > 0`),
        check('agent_activity_positive_run_order', sql`${table.runOrder} > 0`),
        check('agent_activity_positive_sequence', sql`${table.producerSequence} > 0`),
        check('agent_activity_id_shape', sql`${table.id} ~ '^aev_[A-Za-z0-9_-]{16}$'`),
        check(
            'agent_activity_tool_ref',
            sql`${table.toolRef} is null or ${table.toolRef} ~ '^[a-z0-9][a-z0-9._:-]*$'`
        ),
    ]
);
