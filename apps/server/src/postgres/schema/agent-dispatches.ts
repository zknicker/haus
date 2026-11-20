import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

export const agentDispatchesTable = pgTable(
    'agent_dispatches',
    {
        acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
        agentId: text('agent_id').notNull(),
        dispatchId: text('dispatch_id').notNull(),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        id: text('id').primaryKey(),
        requestFingerprint: text('request_fingerprint').notNull(),
        responseBody: bunJsonb('response_body').$type<unknown>(),
        responseStatus: integer('response_status'),
        route: text('route').notNull(),
        runId: text('run_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        state: text('state').notNull().$type<'accepted' | 'finished' | 'unknown'>(),
    },
    (table) => [
        uniqueIndex('agent_dispatches_agent_dispatch_key').on(
            table.serverId,
            table.agentId,
            table.dispatchId
        ),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_dispatches_agent_fk',
        }).onDelete('cascade'),
        check('agent_dispatches_id_shape', sql`${table.id} ~ '^adp_[A-Za-z0-9_-]{16}$'`),
        check('agent_dispatches_state', sql`${table.state} in ('accepted', 'finished', 'unknown')`),
        check(
            'agent_dispatches_finished_shape',
            sql`(${table.state} = 'finished') = (${table.responseStatus} is not null and ${table.finishedAt} is not null)`
        ),
    ]
);
