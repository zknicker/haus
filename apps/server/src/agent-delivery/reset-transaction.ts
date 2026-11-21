import type { AgentActivityEvent } from '@haus/api';
import { eq, sql } from 'drizzle-orm';
import { deleteAgentAreaIn } from '../artifacts/delete-agent-area.ts';
import { settleAgentBackgroundClaims } from '../claims/background-claims.ts';
import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMessageDraftsTable, agentsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isConfigured } from './deferred-configuration.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import * as failureHold from './failure-hold.ts';
import { killedRun } from './interrupt-active-run.ts';
import { recordSessionRotation } from './session-rotation.ts';
import * as store from './store.ts';
import { retireQueuedSubagentWakes } from './subagent-wake-request.ts';

export type AgentResetRequest = { agentId: string; reason?: 'runner'; serverId: string } & (
    | { kind: 'session' }
    | { kind: 'full'; resetBy: string }
);

export async function resetInTransaction(db: HausDatabase, input: AgentResetRequest) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const state = await store.readDeliveryState(tx, input.agentId);
        let activity: AgentActivityEvent | null = null;
        let claimEvents: PreparedRealtimeEvent[] = [];
        if (state?.activeRunId) {
            await revokeRunnerCredentialsForRun(tx, {
                agentId: input.agentId,
                runId: state.activeRunId,
                serverId: input.serverId,
            });
            await store.requeueInboxItemsForRun(tx, {
                agentId: input.agentId,
                runId: state.activeRunId,
            });
            activity = await appendServerAgentActivity(tx, {
                agentId: input.agentId,
                category: 'working',
                phase: 'failed',
                runId: state.activeRunId,
                serverId: input.serverId,
            });
            claimEvents = await settleAgentBackgroundClaims(tx, killedRun(input, state));
            await store.clearActiveRun(tx, input.agentId);
        }
        await store.clearInboxNotices(tx, { agentId: input.agentId });
        await retireQueuedSubagentWakes(tx, input.agentId);
        await failureHold.clearDeliveryFailures(tx, input.agentId);
        const deletedArtifacts = input.kind === 'full' ? await deleteAgentAreaIn(tx, input) : 0;
        const [rotated] = await tx
            .update(agentsTable)
            .set({
                sessionGeneration: sql`${agentsTable.sessionGeneration} + 1`,
                sessionResetKind: input.kind,
            })
            .where(
                sql`${agentsTable.serverId} = ${input.serverId}
                    and ${agentsTable.id} = ${input.agentId}`
            )
            .returning({ sessionGeneration: agentsTable.sessionGeneration });
        if (!rotated) {
            throw new Error('The Agent session could not be rotated.');
        }
        await tx
            .delete(agentMessageDraftsTable)
            .where(eq(agentMessageDraftsTable.agentId, input.agentId));
        const config = await readAgentDispatchConfig(tx, input.agentId);
        const configuration =
            state?.activeRunId &&
            isConfigured(config) &&
            (state.activeRunModelId !== config.desiredModelId ||
                state.activeRunRuntimeId !== config.desiredRuntimeId ||
                state.activeRunReasoningEffort !== config.desiredReasoningEffort)
                ? { agentId: input.agentId, config }
                : null;
        await recordSessionRotation(tx, {
            agentId: input.agentId,
            generation: rotated.sessionGeneration,
            reason: input.reason ?? input.kind,
            serverId: input.serverId,
        });
        return {
            activity,
            chatId: state?.activeRunChatId ?? null,
            computerId: config?.computerId ?? null,
            configuration,
            runId: state?.activeRunId ?? null,
            sessionGeneration: rotated.sessionGeneration,
            claimEvents,
            deletedArtifacts,
        };
    });
}
