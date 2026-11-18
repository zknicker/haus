import type { ComputerManagementCommand, ComputerSystemEvent } from '@haus/api';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { computersTable } from './computers.ts';
import { serversTable } from './servers.ts';

export type ComputerSystemEventType = ComputerSystemEvent['type'];
export type ComputerDisconnectReason = Extract<
    ComputerSystemEvent,
    { type: 'disconnected' }
>['reason'];

export const computerSystemEventsTable = pgTable(
    'computer_system_events',
    {
        command: text('command').$type<ComputerManagementCommand>(),
        computerId: text('computer_id').notNull(),
        id: text('id').primaryKey(),
        occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
        reason: text('reason').$type<ComputerDisconnectReason>(),
        recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        type: text('event_type').notNull().$type<ComputerSystemEventType>(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'computer_system_events_computer_fk',
        }).onDelete('cascade'),
        index('computer_system_events_newest_idx').on(
            table.serverId,
            table.computerId,
            table.occurredAt
        ),
        check('computer_system_events_id_shape', sql`${table.id} ~ '^cse_[A-Za-z0-9_-]{16}$'`),
        check(
            'computer_system_events_type',
            sql`${table.type} in ('connected', 'disconnected', 'management-command')`
        ),
        check(
            'computer_system_events_shape',
            sql`(${table.type} = 'management-command') = (${table.command} is not null)
                and (${table.type} = 'disconnected') = (${table.reason} is not null)`
        ),
        check(
            'computer_system_events_command',
            sql`${table.command} is null or ${table.command} in ('start', 'stop', 'restart', 'upgrade', 'rollback')`
        ),
        check(
            'computer_system_events_reason',
            sql`${table.reason} is null or ${table.reason} in ('heartbeat-timeout', 'socket-closed', 'server-restarted')`
        ),
    ]
);
