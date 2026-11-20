import type { CloudAgentProvider } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { serversTable } from './servers.ts';

export const workerPlaceLimitsTable = pgTable(
    'worker_place_limits',
    {
        place: text('place').notNull().$type<CloudAgentProvider>(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        workerLimit: integer('worker_limit').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serverId, table.place], name: 'worker_place_limits_pkey' }),
        check('worker_place_limits_place', sql`${table.place} in ('cursor', 'claude')`),
        check('worker_place_limits_limit', sql`${table.workerLimit} between 1 and 50`),
    ]
);

export const pendingDefaultWorkerPlacesTable = pgTable(
    'pending_default_worker_places',
    {
        place: text('place').notNull().$type<CloudAgentProvider>(),
        serverId: text('server_id')
            .primaryKey()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        check('pending_default_worker_places_place', sql`${table.place} in ('cursor', 'claude')`),
    ]
);
