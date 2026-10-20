import type { AgentActivityEvent } from '@haus/api';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, agentRunTriggersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { settleAgentBackgroundClaims } from '../tasks/background-claims.ts';
import {
    type DeferredConfiguration,
    rotateDeferredConfiguration,
} from './deferred-configuration.ts';
import * as store from './store.ts';

export interface YieldedHeartbeat {
    activity: AgentActivityEvent | null;
    agentId: string;
    computerId: string;
    configuration: DeferredConfiguration | null;
    runId: string;
    taskEvents: PreparedRealtimeEvent[];
}

/**
 * A daytime heartbeat gives way to anyone who needs the Agent
 * (specs/heartbeat.md#who-runs-and-who-skips). When the active run is a
 * `heartbeat` and a Chat message addressed to the Agent is waiting, the run is
 * stopped without stopping the Agent: its credential is revoked, its inbox item
 * is retired as seen rather than requeued (a stopped slot is not retried), and
 * the run slot clears so the waiting message dispatches normally. The nightly
 * dream never yields. Returns what the caller must announce, or null.
 */
export async function yieldHeartbeatToAddressed(
    tx: HausDatabase,
    state: store.AgentDeliveryRow
): Promise<YieldedHeartbeat | null> {
    if (!(state.activeRunId && state.activeRunComputerId)) {
        return null;
    }
    if (!((await isDaytimeHeartbeat(tx, state)) && (await hasWaitingAddressed(tx, state)))) {
        return null;
    }
    const { agentId, serverId } = state;
    const runId = state.activeRunId;
    await revokeRunnerCredentialsForRun(tx, { agentId, runId, serverId });
    await store.markInboxItemsSeenForRun(tx, { agentId, runId });
    await store.clearInboxNotices(tx, { agentId, runId });
    const activity = await appendServerAgentActivity(tx, {
        agentId,
        category: 'working',
        phase: 'interrupted',
        runId,
        serverId,
    });
    const configuration = await rotateDeferredConfiguration(tx, {
        activeRunModelId: state.activeRunModelId,
        activeRunReasoningEffort: state.activeRunReasoningEffort,
        activeRunRuntimeId: state.activeRunRuntimeId,
        agentId,
        serverId,
    });
    const taskEvents = await settleAgentBackgroundClaims(tx, { agentId, runId, serverId });
    await store.clearActiveRun(tx, agentId);
    return {
        activity,
        agentId,
        computerId: state.activeRunComputerId,
        configuration,
        runId,
        taskEvents,
    };
}

async function isDaytimeHeartbeat(tx: HausDatabase, state: store.AgentDeliveryRow) {
    const [trigger] = await tx
        .select({ source: agentRunTriggersTable.source })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, state.serverId),
                eq(agentRunTriggersTable.agentId, state.agentId),
                eq(agentRunTriggersTable.runId, state.activeRunId ?? '')
            )
        );
    return trigger?.source === 'heartbeat';
}

/** A queued Chat message that names the Agent: a DM, a mention, or a reply to it. */
async function hasWaitingAddressed(tx: HausDatabase, state: store.AgentDeliveryRow) {
    const [row] = await tx
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(
            and(
                store.queuedFor(state.agentId),
                isNotNull(agentInboxTable.chatId),
                or(isNotNull(agentInboxTable.addressedReason), eq(agentInboxTable.mentioned, true))
            )
        )
        .limit(1);
    return row !== undefined;
}
