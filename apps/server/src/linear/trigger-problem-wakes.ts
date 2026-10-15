import type { AgentWake } from '../built-in-connections/built-in-connection.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    type LinearProblemScope,
    type LinearReferenceFacts,
    syncLinearTriggerProblems,
} from './trigger-problem-sync.ts';

/**
 * Re-derives `linear` Trigger problems after a workspace, grant, team, or
 * reference change (specs/linear-triggers.md#failure-modes), inside the
 * caller's transaction. Answers the owners to wake once it commits.
 */
export async function rederiveLinearTriggerProblems(
    tx: HausDatabase,
    input: {
        now: Date;
        references?: LinearReferenceFacts;
        scope: LinearProblemScope;
        serverId: string;
    }
): Promise<AgentWake[]> {
    const { entered } = await syncLinearTriggerProblems(tx, input);
    const owners = new Set(entered.map((notice) => notice.ownerAgentId));
    return [...owners].map((agentId) => ({ agentId, serverId: input.serverId }));
}
