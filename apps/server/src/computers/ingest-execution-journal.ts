import { type AgentExecutionJournalAck, agentExecutionJournalRecordsFrameSchema } from '@haus/api';
import { z } from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishExecutionJournalChange } from '../server-agents/execution-journal-changes.ts';
import {
    type ExecutionJournalWriter,
    ingestExecutionJournalFrame,
} from '../server-agents/execution-journal-ingest.ts';

/**
 * Stores one uploaded execution-journal frame, acknowledges it to its writer,
 * and wakes this Server's open views of the run. True once consumed.
 */
export async function ingestExecutionJournalUpload(
    db: HausDatabase,
    input: {
        acknowledge(ack: AgentExecutionJournalAck): void;
        frame: unknown;
        writer: ExecutionJournalWriter;
    }
) {
    const parsed = agentExecutionJournalRecordsFrameSchema.safeParse(input.frame);
    if (!parsed.success) {
        // A frame that names its run but breaks the envelope (an invalid outline, say) is
        // refused for good; left unanswered, it would hold the writer's resend pass forever.
        const named = namedRecordsFrameSchema.safeParse(input.frame);
        if (!named.success) {
            return false;
        }
        input.acknowledge(ackFor(named.data, 'refused'));
        console.warn('[haus] refused a malformed execution journal frame', {
            agentId: named.data.agentId,
            runId: named.data.runId,
            writer: input.writer,
        });
        return true;
    }
    const frame = parsed.data;
    const outcome = await ingestExecutionJournalFrame(db, { frame, writer: input.writer });
    input.acknowledge(ackFor(frame, outcome.status));
    if (outcome.status === 'stored') {
        publishExecutionJournalChange({
            agentId: frame.agentId,
            runId: frame.runId,
            serverId: outcome.serverId,
        });
    } else {
        console.warn('[haus] refused execution journal records', {
            agentId: frame.agentId,
            runId: frame.runId,
            writer: input.writer,
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

function ackFor(
    frame: { agentId: string; records: ReadonlyArray<{ sequence: number }>; runId: string },
    status: AgentExecutionJournalAck['status']
) {
    const ack: AgentExecutionJournalAck = {
        agentId: frame.agentId,
        runId: frame.runId,
        status,
        throughSequence: frame.records.at(-1)?.sequence ?? 0,
        type: 'agent-execution-journal-ack',
    };
    return ack;
}
