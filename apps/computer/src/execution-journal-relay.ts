import { join } from 'node:path';
import type {
    AgentExecutionJournalRequest,
    AgentExecutionJournalResult,
    AgentExecutionOutlineEntry,
    AgentExecutionOutlinesRequest,
    AgentExecutionOutlinesResult,
} from '@haus/api';
import { agentExecutionJournalRequestSchema, agentExecutionOutlinesRequestSchema } from '@haus/api';
import { outlineExecutionJournal } from './execution-journal-outline.ts';
import { presentExecutionJournal } from './execution-journal-presentation.ts';
import {
    isExecutionJournalRunId,
    readComputerExecutionJournal,
} from './harness/execution-journal.ts';

/** Answers an Owner/Admin evidence read (one journal, or many outlines); null for any other frame. */
export function readExecutionEvidenceFrame(
    frame: unknown,
    dataRoot: string,
    serverId: string
): Promise<AgentExecutionJournalResult | AgentExecutionOutlinesResult> | null {
    const journal = parseExecutionJournalRequest(frame);
    if (journal) {
        return readExecutionJournalRequest({ dataRoot, request: journal, serverId });
    }
    const outlines = parseExecutionOutlinesRequest(frame);
    return outlines
        ? readExecutionOutlinesRequest({ dataRoot, request: outlines, serverId })
        : null;
}

export function parseExecutionJournalRequest(frame: unknown): AgentExecutionJournalRequest | null {
    const parsed = agentExecutionJournalRequestSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

export async function readExecutionJournalRequest(input: {
    dataRoot: string;
    request: AgentExecutionJournalRequest;
    serverId: string;
}): Promise<AgentExecutionJournalResult> {
    if (!isExecutionJournalRunId(input.request.runId)) {
        return unavailableResult(input.request, 'missing');
    }
    const agentRoot = agentRootPath(input.dataRoot, input.serverId, input.request.agentId);
    const journal = await readComputerExecutionJournal(agentRoot, input.request.runId);
    return journal
        ? {
              agentId: input.request.agentId,
              journal: await presentExecutionJournal(journal, agentRoot),
              requestId: input.request.requestId,
              runId: input.request.runId,
              status: 'available',
              type: 'agent-execution-journal-result',
          }
        : unavailableResult(input.request, 'missing');
}

export function parseExecutionOutlinesRequest(
    frame: unknown
): AgentExecutionOutlinesRequest | null {
    const parsed = agentExecutionOutlinesRequestSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Outlines every requested run from its local journal, in request order, in one answer. */
export async function readExecutionOutlinesRequest(input: {
    dataRoot: string;
    request: AgentExecutionOutlinesRequest;
    serverId: string;
}): Promise<AgentExecutionOutlinesResult> {
    const agentRoot = agentRootPath(input.dataRoot, input.serverId, input.request.agentId);
    const outlines: AgentExecutionOutlineEntry[] = [];
    // One journal parsed at a time keeps a 50-run page from holding 50 documents at once.
    for (const runId of input.request.runIds) {
        const journal = isExecutionJournalRunId(runId)
            ? await readComputerExecutionJournal(agentRoot, runId)
            : null;
        outlines.push(
            journal
                ? { outline: outlineExecutionJournal(journal), runId, status: 'available' }
                : { reason: 'missing', runId, status: 'unavailable' }
        );
    }
    return {
        agentId: input.request.agentId,
        outlines,
        requestId: input.request.requestId,
        type: 'agent-execution-outlines-result',
    };
}

function agentRootPath(dataRoot: string, serverId: string, agentId: string): string {
    return join(dataRoot, 'servers', serverId, 'agents', agentId);
}

function unavailableResult(
    request: AgentExecutionJournalRequest,
    reason: 'missing'
): AgentExecutionJournalResult {
    return {
        agentId: request.agentId,
        reason,
        requestId: request.requestId,
        runId: request.runId,
        status: 'unavailable',
        type: 'agent-execution-journal-result',
    };
}
