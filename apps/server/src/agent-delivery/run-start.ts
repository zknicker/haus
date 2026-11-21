import type { AgentReasoningEffort } from '@haus/api';
import { runLivenessClaimEvents } from '../claims/background-claims.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentUpdatedTopic } from '../realtime/topics.ts';
import { recordRunEffectiveState } from '../server-agents/record-agent-effective-state.ts';
import { beginActiveRun } from './store.ts';

export async function startRun(
    tx: HausDatabase,
    run: {
        agentId: string;
        chatId: string | null;
        computerId: string;
        modelId: string;
        reasoningEffort: AgentReasoningEffort;
        runId: string;
        runtimeId: string;
        serverId: string;
    }
) {
    const { serverId, ...active } = run;
    await beginActiveRun(tx, active);
    const changed = await recordRunEffectiveState(tx, active);
    const claims = await runLivenessClaimEvents(tx, {
        agentId: run.agentId,
        runId: run.runId,
        serverId,
    });
    return changed
        ? [...claims, agentUpdatedTopic.prepare({ agentId: run.agentId, serverId })]
        : claims;
}
