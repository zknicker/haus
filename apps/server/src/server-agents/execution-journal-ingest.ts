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
    agentRunnerCredentialsTable,
    agentsTable,
} from '../postgres/schema.ts';

type RecordsEnvelope = Omit<AgentExecutionJournalRecordsFrame, 'records'> & {
    records: Array<{ record: unknown; sequence: number }>;
};

export type ExecutionJournalWriter =
    | { readonly computerId: string; readonly kind: 'computer'; readonly serverId: string }
    | { readonly kind: 'runner' };

export type ExecutionJournalIngestOutcome =
    | { readonly serverId: string; readonly status: 'stored' }
    | { readonly status: 'refused' };

/**
 * Stores one uploaded frame of a run's execution journal (ADR 0048). A Computer
 * writes the journals of the Agents assigned to it; the runner writes the
 * journals of runs the Server minted it a run credential for. Inserts are
 * idempotent by sequence, so a resent frame changes nothing; an `open` record
 * drops every stored record of the run sequenced before it, which it replaces.
 */
export async function ingestExecutionJournalFrame(
    db: HausDatabase,
    input: { frame: RecordsEnvelope; writer: ExecutionJournalWriter }
): Promise<ExecutionJournalIngestOutcome> {
    const { frame } = input;
    const records = parseRecords(frame);
    const serverId = records ? await writerServerId(db, input.writer, frame) : null;
    if (!(records && serverId)) {
        return { status: 'refused' };
    }
    const run = {
        agentId: frame.agentId,
        runId: frame.runId,
        serverId,
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
    return { serverId, status: 'stored' };
}

async function writerServerId(
    db: HausDatabase,
    writer: ExecutionJournalWriter,
    frame: RecordsEnvelope
) {
    if (writer.kind === 'computer') {
        const [agent] = await db
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, writer.serverId),
                    eq(agentsTable.id, frame.agentId),
                    eq(agentsTable.computerId, writer.computerId)
                )
            )
            .limit(1);
        return agent ? writer.serverId : null;
    }
    const [run] = await db
        .select({ serverId: agentsTable.serverId })
        .from(agentsTable)
        .innerJoin(
            agentRunnerCredentialsTable,
            and(
                eq(agentRunnerCredentialsTable.serverId, agentsTable.serverId),
                eq(agentRunnerCredentialsTable.agentId, agentsTable.id)
            )
        )
        .where(
            and(
                eq(agentsTable.id, frame.agentId),
                eq(agentRunnerCredentialsTable.runId, frame.runId),
                isNull(agentRunnerCredentialsTable.computerId)
            )
        )
        .limit(1);
    return run?.serverId ?? null;
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
