import { join } from 'node:path';
import type { AgentExecutionJournalRequest, AgentExecutionJournalResult } from '@haus/api';
import { agentExecutionJournalRequestSchema } from '@haus/api';
import { presentExecutionJournal } from './execution-journal-presentation.ts';
import {
    isExecutionJournalRunId,
    readComputerExecutionJournal,
} from './harness/execution-journal.ts';

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
    const agentRoot = join(
        input.dataRoot,
        'servers',
        input.serverId,
        'agents',
        input.request.agentId
    );
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
