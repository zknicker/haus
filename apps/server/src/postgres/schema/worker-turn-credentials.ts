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
import { workerTurnsTable } from './worker-turns.ts';

export type WorkerTurnCredentialKind = 'push' | 'turn';

export const workerTurnCredentialsTable = pgTable(
    'worker_turn_credentials',
    {
        attempt: integer('attempt').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        kind: text('kind').notNull().$type<WorkerTurnCredentialKind>(),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        serverId: text('server_id').notNull(),
        tokenHash: text('token_hash').primaryKey(),
        turnId: text('turn_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.turnId],
            foreignColumns: [workerTurnsTable.serverId, workerTurnsTable.id],
            name: 'worker_turn_credentials_turn_fk',
        }).onDelete('cascade'),
        index('worker_turn_credentials_turn_idx').on(table.serverId, table.turnId),
        uniqueIndex('worker_turn_credentials_live')
            .on(table.serverId, table.turnId, table.kind, table.attempt)
            .where(sql`${table.revokedAt} is null`),
        check('worker_turn_credentials_kind', sql`${table.kind} in ('turn', 'push')`),
        check('worker_turn_credentials_attempt', sql`${table.attempt} >= 1`),
        check(
            'worker_turn_credentials_token_hash_shape',
            sql`${table.tokenHash} ~ '^[a-f0-9]{64}$'`
        ),
    ]
);
