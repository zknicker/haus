import type { AgentExecutionOutline } from '@haus/api';
import {
    bigint,
    foreignKey,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { agentsTable } from './agents.ts';
import { bunJsonb } from './bun-jsonb.ts';
import { serversTable } from './servers.ts';

/**
 * One run's synced execution journal (ADR 0048): detailed tool evidence the
 * Computer uploads while the run executes, readable by Server Owners and Admins.
 * `run_started_at` drives retention; `outline` is the Computer-built skeleton
 * that arrives with the run's settling records.
 */
export const agentExecutionJournalsTable = pgTable(
    'agent_execution_journals',
    {
        agentId: text('agent_id').notNull(),
        outline: bunJsonb('outline').$type<AgentExecutionOutline>(),
        outlineSequence: bigint('outline_sequence', { mode: 'number' }),
        runId: text('run_id').notNull(),
        runStartedAt: timestamp('run_started_at', { withTimezone: true }).notNull(),
        serverId: text('server_id')
            .notNull()
            .references(() => serversTable.id, { onDelete: 'cascade' }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.agentId, table.runId],
            name: 'agent_execution_journals_pkey',
        }),
        foreignKey({
            columns: [table.serverId, table.agentId],
            foreignColumns: [agentsTable.serverId, agentsTable.id],
            name: 'agent_execution_journals_agent_fk',
        }).onDelete('cascade'),
        index('agent_execution_journals_started_idx').on(table.runStartedAt),
    ]
);

/**
 * The run's journal records in upload order. Append-only: a record is never
 * changed, and an `open` record supersedes every record of its run before it.
 */
export const agentExecutionJournalRecordsTable = pgTable(
    'agent_execution_journal_records',
    {
        agentId: text('agent_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        record: bunJsonb('record').notNull(),
        runId: text('run_id').notNull(),
        sequence: bigint('sequence', { mode: 'number' }).notNull(),
        serverId: text('server_id').notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.serverId, table.agentId, table.runId, table.sequence],
            name: 'agent_execution_journal_records_pkey',
        }),
        foreignKey({
            columns: [table.serverId, table.agentId, table.runId],
            foreignColumns: [
                agentExecutionJournalsTable.serverId,
                agentExecutionJournalsTable.agentId,
                agentExecutionJournalsTable.runId,
            ],
            name: 'agent_execution_journal_records_run_fk',
        }).onDelete('cascade'),
    ]
);
