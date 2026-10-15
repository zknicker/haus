import { EXECUTION_JOURNAL_RETENTION_DAYS } from '@haus/api';
import { lt } from 'drizzle-orm';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentExecutionJournalsTable } from '../postgres/schema.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const retentionMs = EXECUTION_JOURNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Deletes the detailed journals of runs that started before the retention
 * window; their records cascade. Semantic Agent activity and turn summaries are
 * separate history and stay.
 */
export async function deleteExpiredExecutionJournals(db: HausDatabase, now: Date) {
    const deleted = await db
        .delete(agentExecutionJournalsTable)
        .where(lt(agentExecutionJournalsTable.runStartedAt, new Date(now.getTime() - retentionMs)))
        .returning({ runId: agentExecutionJournalsTable.runId });
    return deleted.map((row) => row.runId);
}

/** Runs the retention delete on boot and hourly after that. */
export function startExecutionJournalRetentionSweep(
    db: HausDatabase,
    clock: { now(): Date },
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'execution journal retention sweep',
        run: () => deleteExpiredExecutionJournals(db, clock.now()),
        timers,
    });
}
