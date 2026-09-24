import { agentActivityFrameSchema } from '@haus/api';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { recordComputerAgentActivityWithStatus } from '../server-agents/agent-activity.ts';
import { ingestComputerAgentThought } from '../server-agents/agent-thought.ts';

/**
 * A run's presentation frames: durable semantic activity, committed then
 * broadcast, and volatile thoughts, announced only. True once consumed.
 */
export async function ingestAgentRunFrame(
    db: HausDatabase,
    input: { computerId: string; frame: unknown; serverId: string }
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
    return await ingestComputerAgentThought(db, input);
}
