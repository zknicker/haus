import { agentExecutionJournalRecordsFrameSchema } from '@haus/api';
import { z } from 'zod';
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
        // A frame that names its run but breaks the envelope (an invalid outline, say) is
        // refused for good; left unanswered, it would hold the Computer's backfill forever.
        const named = namedRecordsFrameSchema.safeParse(input.frame);
        if (!named.success) {
            return false;
        }
        acknowledge(connections, input.computerId, named.data, 'refused');
        console.warn('[haus] refused a malformed execution journal frame', {
            agentId: named.data.agentId,
            computerId: input.computerId,
            runId: named.data.runId,
        });
        return true;
    }
    const frame = parsed.data;
    const status = await ingestExecutionJournalFrame(db, { ...input, frame });
    acknowledge(connections, input.computerId, frame, status);
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

/** Just enough of a records frame to answer it. */
const namedRecordsFrameSchema = z.object({
    agentId: z.string().min(1),
    records: z.array(z.object({ sequence: z.number().int().positive().safe() })).min(1),
    runId: z.string().min(1),
    type: z.literal('agent-execution-journal-records'),
});

function acknowledge(
    connections: Pick<ComputerConnections, 'send'>,
    computerId: string,
    frame: { agentId: string; records: ReadonlyArray<{ sequence: number }>; runId: string },
    status: 'refused' | 'stored'
): void {
    connections.send(computerId, {
        agentId: frame.agentId,
        runId: frame.runId,
        status,
        throughSequence: frame.records.at(-1)?.sequence ?? 0,
        type: 'agent-execution-journal-ack',
    });
}
