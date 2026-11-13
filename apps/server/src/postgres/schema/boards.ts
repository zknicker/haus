import { sql } from 'drizzle-orm';
import {
    check,
    foreignKey,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { serverMembershipsTable } from './server-memberships.ts';
import { serversTable } from './servers.ts';

/**
 * A Server's Task board (ADR 0051). Its `key` prefixes every Task key and stays
 * unique per Server even while archived, so an archived board's keys never get
 * reused. `next_number` is the per-board Task counter, allocated under this
 * row's lock.
 */
export const boardsTable = pgTable(
    'boards',
    {
        archivedAt: timestamp('archived_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        /** Null on both for the board the Server itself created: General. */
        createdByAgentId: text('created_by_agent_id'),
        createdByUserId: text('created_by_user_id'),
        id: text('id').primaryKey(),
        key: text('key').notNull(),
        name: text('name').notNull(),
        nextNumber: integer('next_number').notNull().default(1),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        unique('boards_server_id_key').on(table.serverId, table.id),
        uniqueIndex('boards_server_key_key').on(table.serverId, table.key),
        foreignKey({
            columns: [table.serverId, table.createdByUserId],
            foreignColumns: [serverMembershipsTable.serverId, serverMembershipsTable.userId],
            name: 'boards_creator_membership_fk',
        }),
        foreignKey({
            columns: [table.serverId, table.createdByAgentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'boards_creator_agent_fk',
        }),
        check('boards_key_format', sql`${table.key} ~ '^[A-Z][A-Z0-9]{1,4}$'`),
        check('boards_name_length', sql`char_length(${table.name}) between 1 and 60`),
        check(
            'boards_creator_shape',
            sql`num_nonnulls(${table.createdByUserId}, ${table.createdByAgentId}) <= 1`
        ),
        check('boards_next_number', sql`${table.nextNumber} >= 1`),
        check('boards_positive_version', sql`${table.version} > 0`),
    ]
);

/**
 * One column of a board. Every column maps to a fixed category; the name is
 * presentation. Required categories and case-insensitive name uniqueness are
 * whole-list invariants `board.setColumns` checks in one transaction.
 */
export const boardColumnsTable = pgTable(
    'board_columns',
    {
        boardId: text('board_id').notNull(),
        category: text('category')
            .notNull()
            .$type<'backlog' | 'todo' | 'active' | 'done' | 'canceled'>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        position: integer('position').notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        // Tasks reference a column through its board, so a Task's column is
        // always on the Task's own board.
        unique('board_columns_board_id_key').on(table.serverId, table.boardId, table.id),
        foreignKey({
            columns: [table.serverId, table.boardId],
            foreignColumns: [boardsTable.serverId, boardsTable.id],
            name: 'board_columns_board_fk',
        }).onDelete('cascade'),
        index('board_columns_board_position_idx').on(table.boardId, table.position),
        check(
            'board_columns_category',
            sql`${table.category} in ('backlog', 'todo', 'active', 'done', 'canceled')`
        ),
        check('board_columns_name_length', sql`char_length(${table.name}) between 1 and 40`),
        check('board_columns_position', sql`${table.position} >= 0`),
    ]
);
