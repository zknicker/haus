import {
    type AgentExecutionJournalInput,
    type AgentExecutionJournalResult,
    type AgentExecutionOutlines,
    type AgentExecutionOutlinesInput,
    type ExecutionJournalUploadRecord,
    presentExecutionJournal,
    replayExecutionJournalUpload,
} from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentExecutionJournalRecordsTable,
    agentExecutionJournalsTable,
    agentsTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

/** One run's stored journal, replayed from its synced records. */
export async function readAgentExecutionJournal(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentExecutionJournalInput
): Promise<AgentExecutionJournalResult> {
    await requireExecutionEvidenceAccess(db, member, input);
    const rows = await db
        .select({ record: agentExecutionJournalRecordsTable.record })
        .from(agentExecutionJournalRecordsTable)
        .where(
            and(
                eq(agentExecutionJournalRecordsTable.serverId, input.serverId),
                eq(agentExecutionJournalRecordsTable.agentId, input.agentId),
                eq(agentExecutionJournalRecordsTable.runId, input.runId)
            )
        )
        .orderBy(asc(agentExecutionJournalRecordsTable.sequence));
    // Every row was validated against the upload contract when it was stored.
    const document = replayExecutionJournalUpload(
        rows.map((row) => row.record as ExecutionJournalUploadRecord)
    );
    return document?.runId === input.runId
        ? {
              agentId: input.agentId,
              journal: presentExecutionJournal(document),
              runId: input.runId,
              status: 'available',
          }
        : { agentId: input.agentId, runId: input.runId, status: 'missing' };
}

/** The stored outlines of many runs, in request order, under the journal's authorization. */
export async function readAgentExecutionOutlines(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentExecutionOutlinesInput
): Promise<AgentExecutionOutlines> {
    await requireExecutionEvidenceAccess(db, member, input);
    const rows = await db
        .select({
            outline: agentExecutionJournalsTable.outline,
            runId: agentExecutionJournalsTable.runId,
        })
        .from(agentExecutionJournalsTable)
        .where(
            and(
                eq(agentExecutionJournalsTable.serverId, input.serverId),
                eq(agentExecutionJournalsTable.agentId, input.agentId),
                inArray(agentExecutionJournalsTable.runId, input.runIds)
            )
        );
    const outlines = new Map(rows.map((row) => [row.runId, row.outline]));
    return {
        outlines: input.runIds.map((runId) => {
            const outline = outlines.get(runId);
            return outline?.runId === runId
                ? { outline, runId, status: 'available' }
                : { runId, status: 'missing' };
        }),
    };
}

/** Owners and Admins only, for an Agent of this Server. */
export async function requireExecutionEvidenceAccess(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
): Promise<void> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentExecutionJournalAccessError(
            'Only a Server Owner or Admin can inspect Agent execution details.'
        );
    }
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.id, input.agentId), eq(agentsTable.serverId, input.serverId)))
        .limit(1);
    if (!agent) {
        throw new AgentExecutionJournalAccessError('No Agent exists with that id.');
    }
}

export class AgentExecutionJournalAccessError extends Error {}
