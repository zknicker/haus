import { agentActivityFrameSchema, agentExecutionJournalChangedFrameSchema } from '@haus/api';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { recordComputerAgentActivityWithStatus } from '../server-agents/agent-activity.ts';
import type { AgentThoughts } from '../server-agents/agent-thought.ts';
import { publishExecutionJournalChange } from '../server-agents/execution-journal-changes.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';

/**
 * A run's presentation frames: durable semantic activity, committed then
 * broadcast; volatile thoughts, phrased and announced only; and volatile
 * journal-change notices, relayed to open turn views. True once consumed.
 */
export async function ingestAgentRunFrame(
    db: HausDatabase,
    input: { computerId: string; frame: unknown; serverId: string },
    thoughts: AgentThoughts,
    background: Pick<ServerPostCommitWork, 'run'>
): Promise<boolean> {
    const activity = agentActivityFrameSchema.safeParse(input.frame);
    if (activity.success) {
        const committed = await recordComputerAgentActivityWithStatus(db, {
            ...input,
            frame: activity.data,
        });
        if (committed?.inserted) {
            publishCommittedAgentActivity(committed.event);
        }
        return true;
    }
    const journalChanged = agentExecutionJournalChangedFrameSchema.safeParse(input.frame);
    if (journalChanged.success) {
        // Only wakes this Server's authorized viewers of that run; it carries no evidence.
        publishExecutionJournalChange({
            agentId: journalChanged.data.agentId,
            runId: journalChanged.data.runId,
            serverId: input.serverId,
        });
        return true;
    }
    return await thoughts.ingest(db, input, background);
}
