import type { ComputerUseRequestState } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    foreignKey,
    index,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { chatsTable } from './chats.ts';
import { computersTable } from './computers.ts';
import { serversTable } from './servers.ts';
import { usersTable } from './users.ts';

export const computerUseRequestsTable = pgTable(
    'computer_use_requests',
    {
        agentId: text('agent_id').notNull(),
        chatId: text('chat_id').notNull(),
        command: text('command').notNull(),
        computerId: text('computer_id').notNull(),
        decidedAt: timestamp('decided_at', { withTimezone: true }),
        decidedByUserId: text('decided_by_user_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        detail: text('detail').notNull(),
        id: text('id').primaryKey(),
        requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
        runId: text('run_id').notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        standing: boolean('standing').notNull().default(false),
        state: text('state').notNull().$type<ComputerUseRequestState>(),
        toolCallId: text('tool_call_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.serverId, table.chatId],
            foreignColumns: [chatsTable.serverId, chatsTable.id],
            name: 'computer_use_requests_chat_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.computerId],
            foreignColumns: [computersTable.serverId, computersTable.id],
            name: 'computer_use_requests_computer_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'computer_use_requests_agent_fk',
        }).onDelete('cascade'),
        uniqueIndex('computer_use_requests_open_key')
            .on(table.serverId, table.chatId, table.computerId)
            .where(sql`${table.state} = 'requested'`),
        index('computer_use_requests_chat_idx').on(
            table.serverId,
            table.chatId,
            table.computerId,
            table.state
        ),
        index('computer_use_requests_requested_idx').on(table.requestedAt),
        check(
            'computer_use_requests_state',
            sql`${table.state} in ('requested', 'allowed', 'denied')`
        ),
        check(
            'computer_use_requests_decided_shape',
            sql`(${table.state} = 'requested') = (${table.decidedAt} is null)`
        ),
        check(
            'computer_use_requests_standing_shape',
            sql`not ${table.standing} or ${table.state} = 'allowed'`
        ),
        check('computer_use_requests_detail_length', sql`char_length(${table.detail}) <= 200`),
    ]
);
