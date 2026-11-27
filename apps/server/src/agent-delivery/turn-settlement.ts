import type { AgentTurnSummary } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import {
    runLivenessClaimEvents,
    settleAgentBackgroundClaims,
} from '../claims/background-claims.ts';
import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMessageDraftsTable, agentsTable } from '../postgres/schema.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { settleCrewTurn } from '../tasks/crew-finish.ts';
import { settleAgentChain } from './chain-budget.ts';
import { advanceSeenForRun } from './cursors.ts';
import { rotateDeferredConfiguration } from './deferred-configuration.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import * as failureHold from './failure-hold.ts';
import { recordSessionRotation } from './session-rotation.ts';
import * as store from './store.ts';
import { attachSummaryVisibility } from './summary-visibility.ts';

interface SettlingRun {
    serverId: string;
    state: store.AgentDeliveryRow;
    summary: AgentTurnSummary;
}

export async function recoverSessionResume(
    tx: HausDatabase,
    { serverId, state, summary }: SettlingRun
) {
    await revokeRunnerCredentialsForRun(tx, {
        agentId: summary.agentId,
        runId: summary.runId,
        serverId,
    });
    await store.requeueInboxItemsForRun(tx, {
        agentId: summary.agentId,
        runId: summary.runId,
    });
    await store.clearInboxNotices(tx, {
        agentId: summary.agentId,
        runId: summary.runId,
    });
    const activity = await appendServerAgentActivity(tx, {
        agentId: summary.agentId,
        category: 'working',
        phase: 'failed',
        runId: summary.runId,
        serverId,
    });
    const claimEvents = await runLivenessClaimEvents(tx, {
        agentId: summary.agentId,
        runId: summary.runId,
        serverId,
    });
    await store.clearActiveRun(tx, summary.agentId);
    const [rotated] = await tx
        .update(agentsTable)
        .set({
            sessionGeneration: sql`${agentsTable.sessionGeneration} + 1`,
            sessionResetKind: 'session',
        })
        .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, summary.agentId)))
        .returning({ sessionGeneration: agentsTable.sessionGeneration });
    if (!rotated) {
        throw new Error('The Agent recovery session could not be rotated.');
    }
    await tx
        .delete(agentMessageDraftsTable)
        .where(eq(agentMessageDraftsTable.agentId, summary.agentId));
    await failureHold.clearDeliveryFailures(tx, summary.agentId);
    const config = await readAgentDispatchConfig(tx, summary.agentId);
    await recordSessionRotation(tx, {
        agentId: summary.agentId,
        generation: rotated.sessionGeneration,
        reason: 'recovery',
        serverId,
    });
    return { activity, chatId: state.activeRunChatId, claimEvents, config };
}

export async function settleRun(tx: HausDatabase, run: SettlingRun) {
    const settled = await settleRunRecords(tx, run);
    const crewFinish = await settleCrewTurn(tx, {
        agentId: run.summary.agentId,
        runId: run.summary.runId,
        serverId: run.serverId,
        status: run.summary.status,
    });
    return { ...settled, crewFinish };
}

async function settleRunRecords(tx: HausDatabase, { serverId, state, summary }: SettlingRun) {
    const runScope = {
        agentId: summary.agentId,
        runId: summary.runId,
        serverId,
    };
    const chatId = state.activeRunChatId;
    await revokeRunnerCredentialsForRun(tx, {
        agentId: summary.agentId,
        runId: summary.runId,
        serverId,
    });
    await attachSummaryVisibility(tx, state, summary.visibleMessages);
    if (summary.status === 'completed') {
        const completedRows = await store.listInboxItemsForRun(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
        });
        const budgetRows =
            completedRows.length > 0 || !summary.outputProduced
                ? completedRows
                : await store.listOfferedItemsForRun(tx, {
                      agentId: summary.agentId,
                      runId: summary.runId,
                  });
        await advanceSeenForRun(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
            serverId,
        });
        await store.markInboxItemsSeenForRun(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
        });
        await store.releaseUnservedTypedItems(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
            serverId,
        });
        await failureHold.clearDeliveryFailures(tx, summary.agentId);
        await settleAgentChain(tx, summary.agentId, budgetRows, state.agentChainTurns);
        const activity = await appendServerAgentActivity(tx, {
            agentId: summary.agentId,
            category: 'working',
            phase: 'completed',
            runId: summary.runId,
            serverId,
        });
        const configuration = await rotateDeferredConfiguration(tx, {
            activeRunModelId: state.activeRunModelId,
            activeRunReasoningEffort: state.activeRunReasoningEffort,
            activeRunRuntimeId: state.activeRunRuntimeId,
            agentId: summary.agentId,
            serverId,
        });
        const claimEvents = await settleAgentBackgroundClaims(tx, runScope);
        await store.clearActiveRun(tx, summary.agentId);
        return { activity, chatId, configuration, claimEvents };
    }
    // WARNING: requeueing a failed run that produced model-visible output re-triggers that output.
    if (summary.outputProduced) {
        await advanceSeenForRun(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
            serverId,
        });
        await store.markInboxItemsSeenForRun(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
        });
        await store.releaseUnservedTypedItems(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
            serverId,
        });
    } else {
        await store.requeueInboxItemsForRun(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
        });
        await store.clearInboxNotices(tx, {
            agentId: summary.agentId,
            runId: summary.runId,
        });
    }
    const activity = await appendServerAgentActivity(tx, {
        agentId: summary.agentId,
        category: 'working',
        phase: summary.status === 'interrupted' ? 'interrupted' : 'failed',
        runId: summary.runId,
        serverId,
    });
    const configuration = await rotateDeferredConfiguration(tx, {
        activeRunModelId: state.activeRunModelId,
        activeRunReasoningEffort: state.activeRunReasoningEffort,
        activeRunRuntimeId: state.activeRunRuntimeId,
        agentId: summary.agentId,
        serverId,
    });
    const claimEvents = await settleAgentBackgroundClaims(tx, runScope);
    await store.clearActiveRun(tx, summary.agentId);
    await failureHold.recordTurnFailure(tx, runScope, state, {
        failureCode: summary.failureCode,
        failureFingerprint: summary.failureFingerprint,
        failureKind: summary.failureKind,
    });
    return { activity, chatId, configuration, claimEvents };
}
