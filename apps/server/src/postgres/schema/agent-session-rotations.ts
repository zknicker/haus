import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    integer,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';

/**
 * One durable record per Agent session rotation. A reset writes no Chat
 * message: Agent messages carry the generation that wrote them, and this row
 * records when the session started and why. `previousStartedAt` is the moment
 * the retired generation began, so a reader can name how long it lasted.
 */
export const agentSessionRotationsTable = pgTable(
    'agent_session_rotations',
    {
        agentId: text('agent_id').notNull(),
        generation: integer('generation').notNull(),
        previousStartedAt: timestamp('previous_started_at', { withTimezone: true }),
        reason: text('reason').notNull().$type<'configuration' | 'full' | 'recovery' | 'session'>(),
        rotatedAt: timestamp('rotated_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.agentId, table.generation] }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_session_rotations_agent_fk',
        }).onDelete('cascade'),
        check('agent_session_rotations_generation', sql`${table.generation} > 1`),
        check(
            'agent_session_rotations_reason',
            sql`${table.reason} in ('configuration', 'full', 'recovery', 'session')`
        ),
    ]
);
