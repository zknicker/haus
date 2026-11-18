import {
    type AgentExecutionJournalRecordsFrame,
    type ExecutionJournalUploadRecord,
    parseExecutionJournalUploadRecord,
} from '@haus/api';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentExecutionJournalRecordsTable,
    agentExecutionJournalsTable,
    agentsTable,
} from '../postgres/schema.ts';

type RecordsEnvelope = Omit<AgentExecutionJournalRecordsFrame, 'records'> & {
    records: Array<{ record: unknown; sequence: number }>;
};

export type ExecutionJournalIngestOutcome = 'refused' | 'stored';

/**
 * Stores one uploaded frame of a run's execution journal (ADR 0048). Only the
 * Computer an Agent is assigned to may write its journals. Inserts are
 * idempotent by sequence, so a resent frame changes nothing; an `open` record
 * drops every stored record of the run sequenced before it, which it replaces.
 */
export async function ingestExecutionJournalFrame(
    db: HausDatabase,
    input: { computerId: string; frame: RecordsEnvelope; serverId: string }
): Promise<ExecutionJournalIngestOutcome> {
    const { frame } = input;
    const records = parseRecords(frame);
    if (!records) {
        return 'refused';
    }
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, frame.agentId),
                eq(agentsTable.computerId, input.computerId)
            )
        )
        .limit(1);
    if (!agent) {
        return 'refused';
    }
    const run = {
        agentId: frame.agentId,
        runId: frame.runId,
        serverId: input.serverId,
    };
    const opensAt = lastOpenIndex(records);
    const stored = opensAt >= 0 ? records.slice(opensAt) : records;
    const throughSequence = records.at(-1)?.sequence ?? 0;
    await db.transaction(async (tx) => {
        await tx
            .insert(agentExecutionJournalsTable)
            .values({ ...run, runStartedAt: new Date(frame.runStartedAt) })
            .onConflictDoUpdate({
                set: { updatedAt: new Date() },
                target: [
                    agentExecutionJournalsTable.serverId,
                    agentExecutionJournalsTable.agentId,
                    agentExecutionJournalsTable.runId,
                ],
            });
        const opening = stored[0];
        if (opensAt >= 0 && opening) {
            // Only what came before the open: a late resend of this frame must
            // not drop records stored after it.
            await tx
                .delete(agentExecutionJournalRecordsTable)
                .where(
                    and(
                        runRecords(run),
                        lt(agentExecutionJournalRecordsTable.sequence, opening.sequence)
                    )
                );
        }
        await tx
            .insert(agentExecutionJournalRecordsTable)
            .values(stored.map(({ record, sequence }) => ({ ...run, record, sequence })))
            .onConflictDoNothing();
        if (frame.outline) {
            await tx
                .update(agentExecutionJournalsTable)
                .set({ outline: frame.outline, outlineSequence: throughSequence })
                .where(
                    and(
                        eq(agentExecutionJournalsTable.serverId, run.serverId),
                        eq(agentExecutionJournalsTable.agentId, run.agentId),
                        eq(agentExecutionJournalsTable.runId, run.runId),
                        or(
                            isNull(agentExecutionJournalsTable.outlineSequence),
                            lt(agentExecutionJournalsTable.outlineSequence, throughSequence)
                        )
                    )
                );
        }
    });
    return 'stored';
}

/** Every record parsed, in sequence order, and every `open` naming this run; else null. */
function parseRecords(
    frame: RecordsEnvelope
): Array<{ record: ExecutionJournalUploadRecord; sequence: number }> | null {
    const parsed: Array<{ record: ExecutionJournalUploadRecord; sequence: number }> = [];
    let previous = 0;
    for (const entry of frame.records) {
        const record = parseExecutionJournalUploadRecord(entry.record);
        if (
            !record ||
            entry.sequence <= previous ||
            (record.type === 'open' && record.document.runId !== frame.runId)
        ) {
            return null;
        }
        previous = entry.sequence;
        parsed.push({ record, sequence: entry.sequence });
    }
    return parsed;
}

function runRecords(run: { agentId: string; runId: string; serverId: string }) {
    return and(
        eq(agentExecutionJournalRecordsTable.serverId, run.serverId),
        eq(agentExecutionJournalRecordsTable.agentId, run.agentId),
        eq(agentExecutionJournalRecordsTable.runId, run.runId)
    );
}

function lastOpenIndex(records: readonly { record: ExecutionJournalUploadRecord }[]): number {
    for (let index = records.length - 1; index >= 0; index -= 1) {
        if (records[index]?.record.type === 'open') {
            return index;
        }
    }
    return -1;
}
