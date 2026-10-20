import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { settleAgentBackgroundClaims } from '../tasks/background-claims.ts';
import { rotateDeferredConfiguration } from './deferred-configuration.ts';
import * as store from './store.ts';

/**
 * Clears an Agent's active run for a stop or a reset: revokes its credential,
 * requeues its inbox items, records the interruption, and settles its background
 * claims. Returns what the caller must announce, or null when no run is active.
 */
export async function interruptActiveRun(
    db: HausDatabase,
    input: { agentId: string; serverId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const state = await store.readDeliveryState(tx, input.agentId);
        if (!(state?.activeRunId && state.activeRunComputerId)) {
            return null;
        }
        await revokeRunnerCredentialsForRun(tx, {
            agentId: input.agentId,
            runId: state.activeRunId,
            serverId: input.serverId,
        });
        await store.requeueInboxItemsForRun(tx, {
            agentId: input.agentId,
            runId: state.activeRunId,
        });
        const activity = await appendServerAgentActivity(tx, {
            agentId: input.agentId,
            category: 'working',
            phase: 'failed',
            runId: state.activeRunId,
            serverId: input.serverId,
        });
        const configuration = await rotateDeferredConfiguration(tx, {
            activeRunModelId: state.activeRunModelId,
            activeRunReasoningEffort: state.activeRunReasoningEffort,
            activeRunRuntimeId: state.activeRunRuntimeId,
            agentId: input.agentId,
            serverId: input.serverId,
        });
        const taskEvents = await settleAgentBackgroundClaims(tx, killedRun(input, state));
        await store.clearActiveRun(tx, input.agentId);
        return {
            activity,
            chatId: state.activeRunChatId,
            computerId: state.activeRunComputerId,
            configuration,
            runId: state.activeRunId,
            taskEvents,
        };
    });
}

/**
 * A stopped run leaves its open claims visible for recovery.
 */
export function killedRun(
    input: { agentId: string; serverId: string },
    state: { activeRunId: string | null }
) {
    return {
        agentId: input.agentId,
        runId: state.activeRunId ?? '',
        serverId: input.serverId,
    };
}
