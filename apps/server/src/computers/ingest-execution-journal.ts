import { agentExecutionJournalRecordsFrameSchema } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishExecutionJournalChange } from '../server-agents/execution-journal-changes.ts';
import { ingestExecutionJournalFrame } from '../server-agents/execution-journal-ingest.ts';
import type { ComputerConnections } from './connections.ts';

/**
 * Stores one uploaded execution-journal frame, acknowledges it to the Computer,
 * and wakes this Server's open views of the run. True once consumed.
 */
export async function ingestExecutionJournalUpload(
    db: HausDatabase,
    connections: Pick<ComputerConnections, 'send'>,
    input: { computerId: string; frame: unknown; serverId: string }
): Promise<boolean> {
    const parsed = agentExecutionJournalRecordsFrameSchema.safeParse(input.frame);
    if (!parsed.success) {
        return false;
    }
    const frame = parsed.data;
    const status = await ingestExecutionJournalFrame(db, { ...input, frame });
    connections.send(input.computerId, {
        agentId: frame.agentId,
        runId: frame.runId,
        status,
        throughSequence: frame.records.at(-1)?.sequence ?? 0,
        type: 'agent-execution-journal-ack',
    });
    if (status === 'stored') {
        publishExecutionJournalChange({
            agentId: frame.agentId,
            runId: frame.runId,
            serverId: input.serverId,
        });
    } else {
        console.warn('[haus] refused execution journal records', {
            agentId: frame.agentId,
            computerId: input.computerId,
            runId: frame.runId,
        });
    }
    return true;
}
