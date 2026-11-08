import {
    type Agent,
    type AgentActivityEvent,
    type AgentCommand,
    type AgentTurnSummary,
    isChatlessInboxSource,
    type ReminderScriptCommand,
    type ReminderScriptResult,
} from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import { and, eq, sql } from 'drizzle-orm';
import {
    runLivenessClaimEvents,
    settleAgentBackgroundClaims,
} from '../claims/background-claims.ts';
import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentMessageDraftsTable, agentsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { publishRealtime } from '../realtime/topic.ts';
import {
    listReminderScriptCommands,
    settleReminderScript,
} from '../reminders/reminder-script-delivery.ts';
import { recordReminderWakeUsage } from '../reminders/reminder-wake-usage.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { readActiveAgentActivity } from '../server-agents/agent-activity-history.ts';
import type { AgentConfigurationRotation } from '../server-agents/configure-agent.ts';
import { recordAgentTurnSummary, recordRunTrigger } from '../server-agents/record-agent-turn.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { publishCommittedAgentActivity } from './activity-events.ts';
import { planBusyNotice } from './busy-notice.ts';
import { admitQueuedAgentDrain, restartIdleAgentChain, settleAgentChain } from './chain-budget.ts';
import { advanceSeenForRun, markCursorSubsumedSeen } from './cursors.ts';
import {
    configureFrame,
    type DeferredConfiguration,
    isConfigured,
    rotateDeferredConfiguration,
    sendDeferredConfiguration,
} from './deferred-configuration.ts';
import {
    type AgentConfigureRequest,
    listComputerAgents,
    readAgentDispatchConfig,
    reconcileConfigureFrame,
    startPromptFacts,
} from './dispatch-config.ts';
import { dispatchEach } from './dispatch-each.ts';
import { traceAgentDispatch } from './dispatch-telemetry.ts';
import {
    boundedCompatibleRows,
    chatIdsOf,
    claimRunItems,
    readDrainCandidates,
    startFrame,
} from './drain-selection.ts';
import type { EnqueueInput } from './enqueue-input.ts';
import * as failureHold from './failure-hold.ts';
import { planChatlessRun } from './heartbeat-run.ts';
import { type YieldedHeartbeat, yieldHeartbeatToAddressed } from './heartbeat-yield.ts';
import { buildInboxItems } from './inbox-items.ts';
import { isConcreteInboxSource as isConcreteSource } from './inbox-lanes.ts';
import { interruptActiveRun, killedRun } from './interrupt-active-run.ts';
import { publishAgentLifecycle } from './lifecycle.ts';
import { consumeNoticeAck } from './notice-ack.ts';
import { isBackedOff } from './retry-policy.ts';
import { recordSessionRotation } from './session-rotation.ts';
import * as store from './store.ts';
import { retireQueuedSubagentWakes } from './subagent-wake-request.ts';
import { attachSummaryVisibility } from './summary-visibility.ts';
import { isolateUnrenderableItems } from './undeliverable-items.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/** The Server→Computer wire, narrowed to what durable delivery needs. */
export interface DeliveryTransport {
    isOnline(computerId: string): boolean;
    send(computerId: string, frame: AgentCommand): boolean;
}

export interface DispatchPlan {
    activities?: AgentActivityEvent[];
    /** `claim.updated` for the claims this run just made live. */
    claimEvents?: PreparedRealtimeEvent[];
    computerId: string;
    configuration?: DeferredConfiguration;
    frame: AgentCommand;
    serverId: string;
    suppressSend?: boolean;
    /** A daytime heartbeat this plan stopped to make room for addressed work. */
    yielded?: YieldedHeartbeat;
}

interface DispatchOptions {
    /** Resend even an acknowledged run — a reconnecting Computer lost its process. */
    resendActive?: boolean;
}

/**
 * Server-owned durable Agent delivery. PostgreSQL owns all run, stop, and pending-inbox state, so a restarted Server or reconnecting Computer resumes
 * without losing accepted work. Crash recovery is at least once, so lost
 * settlement evidence may repeat model-visible work. Agents serialize independently, and the
 * retry sweep resends unacknowledged
 * deliveries, reconnect reconciliation is idempotent, and a floating-session
 * run drains a bounded slice across all pending targets.
 */
export class AgentDelivery {
    private readonly wakePauseLifts = new failureHold.WakePauseLifts();

    constructor(
        private readonly db: HausDatabase,
        private readonly transport: DeliveryTransport,
        readonly runtime?: EffectRuntime<never>
    ) {}

    /**
     * Records inbound work durably, inside the caller's transaction so the
     * enqueue commits atomically with the message that produced it — a committed
     * message can never leave its wake unqueued. Dispatch to the wire is the
     * separate, recoverable step {@link dispatchAgent}.
     */
    async enqueue(tx: HausDatabase, input: EnqueueInput): Promise<void> {
        const source = input.source ?? 'human';
        await store.ensureDeliveryState(tx, { agentId: input.agentId, serverId: input.serverId });
        await store.enqueueInboxItem(tx, { ...input, source });
        // Only human intent lifts a wake pause, releases a failure hold, or
        // releases the automation chain ceiling, even when older Agent or
        // Trigger rows precede it. Agent and automation work queues behind any hold.
        if (source === 'human') {
            await failureHold.releaseHoldsForHuman(tx, input, this.wakePauseLifts);
        }
    }

    /** Enqueues work in its own transaction and dispatches — the direct-caller path. */
    async deliver(input: EnqueueInput): Promise<void> {
        const plan = await traceAgentDispatch(this.runtime, input, async () =>
            this.db.transaction(async (tx) => {
                await lockServerRow(tx, input.serverId);
                await this.enqueue(tx, input);
                return this.planDispatch(tx, input.agentId);
            })
        );
        this.wakePauseLifts.announce(input.agentId);
        this.emit(plan);
    }

    /** Best-effort wire dispatch for an Agent; durable state already committed. */
    async dispatchAgent(
        agentId: string,
        serverId: string,
        options?: DispatchOptions
    ): Promise<void> {
        try {
            await this.dispatchOnce(agentId, serverId, options);
        } catch (cause) {
            if (!(await isolateUnrenderableItems(this.db, { agentId, serverId }))) {
                throw cause;
            }
            await this.dispatchOnce(agentId, serverId, options);
        }
    }

    private async dispatchOnce(agentId: string, serverId: string, options?: DispatchOptions) {
        const plan = await traceAgentDispatch(this.runtime, { agentId, serverId }, async () =>
            this.db.transaction(async (tx) => {
                await lockServerRow(tx, serverId);
                await store.ensureDeliveryState(tx, { agentId, serverId });
                return this.planDispatch(tx, agentId, options);
            })
        );
        this.wakePauseLifts.announce(agentId);
        this.emit(plan);
    }

    /**
     * Human Stop: persist the flag, revoke the live run's runner credential so the
     * Stop holds even if the Computer is offline or restarts, requeue the run's
     * work, and best-effort kill the live turn and any background sub-agents the
     * Agent left running between turns (their queued wakes retire with them).
     */
    async stop(input: { agentId: string; serverId: string }): Promise<void> {
        const kill = await interruptActiveRun(this.db, input, { stop: true });
        if (kill) {
            this.announceKilledRun(input, kill);
        }
        const config = await readAgentDispatchConfig(this.db, input.agentId);
        if (config?.computerId) {
            this.transport.send(config.computerId, {
                agentId: input.agentId,
                type: 'agent-stop-background',
            });
        }
    }

    /** Human Start: clear the flag and any backoff, then drain the pending inbox. */
    async start(input: { agentId: string; serverId: string }): Promise<void> {
        const plan = await this.db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await store.setStopped(tx, { ...input, stopped: false });
            await failureHold.clearDeliveryFailures(tx, input.agentId);
            await store.clearInboxNotices(tx, { agentId: input.agentId });
            return this.planDispatch(tx, input.agentId);
        });
        this.emit(plan);
    }

    /** Restarts the executor while preserving the Agent's current session. */
    async restart(input: { agentId: string; serverId: string }): Promise<void> {
        const config = await readAgentDispatchConfig(this.db, input.agentId);
        if (!(config?.computerId && this.transport.isOnline(config.computerId))) {
            throw new Error('The assigned Computer must be online to restart this Agent.');
        }
        const interrupted = await interruptActiveRun(this.db, input);
        if (interrupted) {
            this.announceKilledRun(input, interrupted);
        }
        if (
            !this.transport.send(config.computerId, {
                agentId: input.agentId,
                type: 'agent-restart',
            })
        ) {
            throw new Error('The assigned Computer disconnected before the Agent could restart.');
        }
        await this.start(input);
    }

    /** Rotates session identity; full reset also recreates Computer-local Agent state. */
    async reset(input: { agentId: string; kind: 'full' | 'session'; serverId: string }) {
        const result = await this.db.transaction(async (tx) => {
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
                reason: input.kind,
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
            };
        });
        publishRealtime(result.claimEvents);
        if (result.activity) {
            publishCommittedAgentActivity(result.activity);
        }
        if (!result.computerId) {
            return;
        }
        if (result.runId) {
            publishAgentLifecycle({
                agentId: input.agentId,
                chatId: result.chatId,
                outcome: 'stopped',
                phase: 'settled',
                runId: result.runId,
                serverId: input.serverId,
            });
            this.transport.send(result.computerId, {
                agentId: input.agentId,
                runId: result.runId,
                type: 'stop',
            });
        }
        if (result.configuration) {
            sendDeferredConfiguration(this.transport, input.agentId, result.configuration);
        }
        this.transport.send(result.computerId, {
            agentId: input.agentId,
            kind: input.kind,
            sessionGeneration: result.sessionGeneration,
            type: 'agent-reset',
        });
    }

    async onAck(input: { agentId: string; runId: string }): Promise<void> {
        const stateAndPlan = await this.db.transaction(async (tx) => {
            const serverId = await store.readAgentServerId(tx, input.agentId);
            if (!serverId) {
                return null;
            }
            await lockServerRow(tx, serverId);
            await store.markAccepted(tx, input);
            const state = await store.readDeliveryState(tx, input.agentId);
            return {
                acceptedActivity:
                    state?.activeRunId === input.runId
                        ? ((await readActiveAgentActivity(tx, serverId)).activities.find(
                              (activity) =>
                                  activity.agentId === input.agentId &&
                                  activity.runId === input.runId
                          ) ?? null)
                        : null,
                plan:
                    state?.activeRunId === input.runId
                        ? await this.planDispatch(tx, input.agentId)
                        : null,
                state,
            };
        });
        const state = stateAndPlan?.state;
        if (stateAndPlan?.acceptedActivity) {
            const { runStartedAt: _runStartedAt, ...activity } = stateAndPlan.acceptedActivity;
            publishCommittedAgentActivity(activity);
        }
        if (state?.activeRunId === input.runId) {
            publishAgentLifecycle({
                agentId: input.agentId,
                chatId: state.activeRunChatId,
                phase: 'reading',
                runId: input.runId,
                serverId: state.serverId,
            });
        }
        this.emit(stateAndPlan?.plan ?? null);
    }

    async onNoticeAck(input: { agentId: string; runId: string; workIds: string[] }) {
        await consumeNoticeAck(this.db, this.runtime, input);
    }

    /** A run settled on the Computer: consume or requeue its work, then drain when eligible. */
    async onTurnSettled(computerId: string, summary: AgentTurnSummary): Promise<void> {
        await recordAgentTurnSummary(this.db, computerId, summary);
        const serverId = await store.readAgentServerId(this.db, summary.agentId);
        if (!serverId) {
            return;
        }
        await recordReminderWakeUsage(
            this.db,
            { agentId: summary.agentId, runId: summary.runId, serverId },
            summary.tokenUsage
        );
        if (summary.failureKind === 'session-resume' && !summary.outputProduced) {
            const recovery = await this.db.transaction(async (tx) => {
                await lockServerRow(tx, serverId);
                const state = await store.readDeliveryState(tx, summary.agentId);
                if (
                    state?.activeRunId !== summary.runId ||
                    state.activeRunComputerId !== computerId
                ) {
                    return null;
                }
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
                    .where(
                        and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, summary.agentId))
                    )
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
                return {
                    activity,
                    chatId: state.activeRunChatId,
                    config,
                    plan: await this.planDispatch(tx, summary.agentId),
                    claimEvents,
                };
            });
            if (!recovery) {
                return;
            }
            publishRealtime(recovery.claimEvents);
            if (recovery.activity) {
                publishCommittedAgentActivity(recovery.activity);
            }
            if (isConfigured(recovery.config)) {
                this.transport.send(
                    recovery.config.computerId,
                    configureFrame(summary.agentId, recovery.config)
                );
            }
            publishAgentLifecycle({
                agentId: summary.agentId,
                chatId: recovery.chatId,
                outcome: 'failed',
                phase: 'settled',
                runId: summary.runId,
                serverId,
            });
            this.emit(recovery.plan);
            return;
        }
        const runScope = {
            agentId: summary.agentId,
            runId: summary.runId,
            serverId,
        };
        const settlement = await this.db.transaction(async (tx) => {
            await lockServerRow(tx, serverId);
            const state = await store.readDeliveryState(tx, summary.agentId);
            if (state?.activeRunId !== summary.runId || state.activeRunComputerId !== computerId) {
                // A stale or duplicate summary for an already-cleared run: the
                // durable record upsert above is the only effect.
                return null;
            }
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
                return {
                    activity,
                    chatId,
                    configuration,
                    plan: await this.planDispatch(tx, summary.agentId),
                    claimEvents,
                };
            }
            // A failed turn that produced model-visible output must not requeue
            // its work — redelivering it would re-trigger that output. Only a
            // failure with no output is safe to retry. Either way it counts and
            // does not re-drive immediately: failures back off, then pause.
            if (summary.outputProduced) {
                // A durable Agent send proves the model handled this prompt,
                // even if the runtime failed during later cleanup.
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
            return { activity, chatId, configuration, plan: null, claimEvents };
        });
        if (!settlement) {
            return;
        }
        publishRealtime(settlement.claimEvents);
        if (settlement.activity) {
            publishCommittedAgentActivity(settlement.activity);
        }
        if (settlement.configuration) {
            sendDeferredConfiguration(this.transport, summary.agentId, settlement.configuration);
        }
        publishAgentLifecycle({
            agentId: summary.agentId,
            chatId: settlement.chatId,
            outcome: summary.status,
            phase: 'settled',
            runId: summary.runId,
            serverId,
        });
        this.emit(settlement.plan);
    }

    /**
     * A Computer (re)connected: resend every in-flight run — acknowledged or not —
     * because the Computer may have lost its live turn, then drain queued work.
     * A live daemon suppresses concurrent duplicates. After process loss, an
     * accepted-but-unsettled run intentionally replays at least once.
     */
    async onComputerReconnect(computerId: string): Promise<void> {
        for (const command of await listReminderScriptCommands(this.db, computerId)) {
            this.transport.send(computerId, command);
        }
        const agents = await listComputerAgents(this.db, computerId);
        for (const agent of agents) {
            if (agent.retiredAt) {
                this.transport.send(computerId, {
                    agentId: agent.agentId,
                    type: 'agent-retire',
                });
                continue;
            }
            if (agent.factoryKind === 'cove' && !agent.factoryAppliedAt) {
                continue;
            }
            const state = await store.readDeliveryState(this.db, agent.agentId);
            const activeConfigurationChanged =
                Boolean(state?.activeRunId) &&
                (state?.activeRunModelId !== agent.desiredModelId ||
                    state?.activeRunRuntimeId !== agent.desiredRuntimeId ||
                    state?.activeRunReasoningEffort !== agent.desiredReasoningEffort);
            const { desiredModelId, desiredRuntimeId } = agent;
            if (!activeConfigurationChanged && desiredModelId && desiredRuntimeId) {
                this.transport.send(
                    computerId,
                    reconcileConfigureFrame({ ...agent, desiredModelId, desiredRuntimeId })
                );
            }
            await this.dispatchAgent(agent.agentId, agent.serverId, { resendActive: true });
        }
    }

    /** Best-effort immediate cleanup; the durable retirement tombstone replays on reconnect. */
    retireAgent(input: { agentId: string; computerId: string }): void {
        this.transport.send(input.computerId, {
            agentId: input.agentId,
            type: 'agent-retire',
        });
    }

    /**
     * Applies a validated desired runtime/model snapshot. A changed pair rotates
     * the authoritative session before the Computer receives the new config;
     * a no-op pair only resends configuration.
     */
    async applyAgentConfiguration(input: {
        agent: Agent;
        rotation: AgentConfigurationRotation | null;
    }): Promise<void> {
        const { agent, rotation } = input;
        if (rotation?.deferred) {
            return;
        }
        if (rotation) {
            if (rotation.activity) {
                publishCommittedAgentActivity(rotation.activity);
            }
            if (rotation.runId) {
                publishAgentLifecycle({
                    agentId: agent.id,
                    chatId: rotation.chatId,
                    outcome: 'stopped',
                    phase: 'settled',
                    runId: rotation.runId,
                    serverId: agent.serverId,
                });
                this.transport.send(rotation.computerId, {
                    agentId: agent.id,
                    runId: rotation.runId,
                    type: 'stop',
                });
            }
        }
        await this.configureAgent({
            agentDescription: agent.description,
            agentId: agent.id,
            agentName: agent.displayName,
            computerId: agent.computerId,
            modelId: agent.desiredModelId,
            reasoningEffort: agent.desiredReasoningEffort,
            runtimeId: agent.desiredRuntimeId,
        });
        if (rotation) {
            await this.dispatchAgent(agent.id, agent.serverId);
        }
    }

    /** Best-effort immediate apply; reconnect reconciliation resends the full snapshot. */
    async configureAgent(input: AgentConfigureRequest): Promise<void> {
        const config = await readAgentDispatchConfig(this.db, input.agentId);
        if (!config) {
            return;
        }
        this.transport.send(input.computerId, {
            agentDescription: input.agentDescription,
            agentId: input.agentId,
            agentName: input.agentName,
            // The brief is durable Agent state, so it rides every configure
            // rather than only the one that follows creation.
            brief: config.brief,
            briefAuthorHandle: config.briefAuthorHandle,
            modelId: input.modelId,
            reasoningEffort: input.reasoningEffort,
            runtimeId: input.runtimeId,
            sessionGeneration: config.sessionGeneration,
            sessionResetKind: config.sessionResetKind,
            factoryKind: config.factoryKind,
            type: 'agent-configure',
        });
    }

    dispatchReminderScript(computerId: string, command: ReminderScriptCommand): void {
        this.transport.send(computerId, command);
    }

    async onReminderScriptResult(computerId: string, result: ReminderScriptResult): Promise<void> {
        await settleReminderScript(
            this.db,
            computerId,
            result,
            async (tx, input) => await this.enqueue(tx, input)
        );
        const serverId = await store.readAgentServerId(this.db, result.agentId);
        if (serverId) {
            await this.dispatchAgent(result.agentId, serverId);
        }
    }

    /** Periodic reconciliation: resend unacknowledged deliveries, drain stragglers. */
    async sweep(): Promise<void> {
        await dispatchEach(this, await store.listDispatchCandidates(this.db));
    }

    /**
     * The single serialization point, run under the Server row lock. It resends an
     * in-flight run (always when reconnecting, otherwise only while
     * unacknowledged), notices a busy Agent about queued work, or drains one
     * pending inbox into a fresh run. Returns the frame to send.
     */
    private async planDispatch(
        tx: HausDatabase,
        agentId: string,
        options?: DispatchOptions
    ): Promise<DispatchPlan | null> {
        const state = await store.readDeliveryState(tx, agentId);
        const config = await readAgentDispatchConfig(tx, agentId);
        if (!(state && isConfigured(config)) || state.stopped) {
            return null;
        }
        if (!this.transport.isOnline(config.computerId)) {
            return null;
        }
        await markCursorSubsumedSeen(tx, { agentId, serverId: state.serverId });
        const yielded = await yieldHeartbeatToAddressed(tx, state);
        if (yielded) {
            const next = await this.planDispatch(tx, agentId);
            const activities = [
                ...(yielded.activity ? [yielded.activity] : []),
                ...(next?.activities ?? []),
            ];
            return {
                ...(next ?? {
                    computerId: yielded.computerId,
                    frame: { agentId, runId: yielded.runId, type: 'stop' as const },
                    serverId: state.serverId,
                    suppressSend: true,
                }),
                activities,
                configuration: yielded.configuration ?? next?.configuration,
                claimEvents: [...yielded.claimEvents, ...(next?.claimEvents ?? [])],
                yielded,
            };
        }
        if (state.activeRunId && state.activeRunComputerId) {
            if (!state.acceptedAt || options?.resendActive) {
                await store.markDispatched(tx, { agentId, runId: state.activeRunId });
                // Resend the run exactly as first dispatched: the runtime and
                // model were frozen onto the run, so a mid-flight reconfigure
                // never changes what an in-flight run launches with.
                const frame = await startFrame(tx, state, config);
                if (
                    frame.type === 'start' &&
                    frame.inboxDelivery === 'notice' &&
                    frame.inbox.length === 0 &&
                    !frame.greets
                ) {
                    const activity = await appendServerAgentActivity(tx, {
                        agentId,
                        category: 'working',
                        phase: 'failed',
                        runId: state.activeRunId,
                        serverId: state.serverId,
                    });
                    const configuration = await rotateDeferredConfiguration(tx, {
                        activeRunModelId: state.activeRunModelId,
                        activeRunReasoningEffort: state.activeRunReasoningEffort,
                        activeRunRuntimeId: state.activeRunRuntimeId,
                        agentId,
                        serverId: state.serverId,
                    });
                    await store.clearActiveRun(tx, agentId);
                    const next = await this.planDispatch(tx, agentId);
                    if (next) {
                        return {
                            ...next,
                            activities: [
                                ...(activity ? [activity] : []),
                                ...(next.activities ?? []),
                            ],
                            configuration: configuration ?? next.configuration,
                        };
                    }
                    return {
                        activities: activity ? [activity] : [],
                        computerId: state.activeRunComputerId,
                        configuration: configuration ?? undefined,
                        frame,
                        serverId: state.serverId,
                        suppressSend: true,
                    };
                }
                return {
                    computerId: state.activeRunComputerId,
                    frame,
                    serverId: state.serverId,
                };
            }
            const notice = await planBusyNotice(tx, {
                agentId,
                runId: state.activeRunId,
                serverId: state.serverId,
            });
            return notice
                ? {
                      computerId: state.activeRunComputerId,
                      frame: notice,
                      serverId: state.serverId,
                  }
                : null;
        }
        if (isBackedOff(state)) {
            return null;
        }
        const { candidates, lead: preferred, mayLead } = await readDrainCandidates(tx, agentId);
        if (!preferred) {
            return null;
        }
        const chainTurns = await restartIdleAgentChain(tx, agentId, state.agentChainTurns);
        const drain = { agentId, candidates, chainTurns, lead: preferred };
        const admitted = await admitQueuedAgentDrain(tx, drain, boundedCompatibleRows);
        if (!(admitted && mayLead(admitted.lead))) {
            return null;
        }
        const first = admitted.lead;
        // A dream, heartbeat, report, sub-agent wake, or Task assignment is concrete work with
        // no Chat: a chatless run. A heartbeat-family run resets the chain, so admission may
        // also pick it as the lead at the ceiling. Each runs alone, except Task assignments,
        // which coalesce: ten assignments wake the Agent once (ADR 0051).
        if (isChatlessInboxSource(first.source)) {
            const rows = first.source === 'task_assignment' ? admitted.selected : [first];
            return await planChatlessRun(tx, { agentId, config, rows, state });
        }
        const runId = createOpaqueId('run');
        const concrete = isConcreteSource(first.source);
        // The Server decides what may be drained; the Computer decides the lane,
        // because only it knows whether the harness session is still alive.
        const { drainRows, greets, noticeRows, selected, warmDrainRows } = await claimRunItems(tx, {
            agentId,
            concrete,
            runId,
            selected: admitted.selected,
        });
        // Freeze execution configuration onto the run so every resend uses these values.
        await store.beginActiveRun(tx, {
            agentId,
            chatId: first.chatId,
            computerId: config.computerId,
            modelId: config.desiredModelId,
            reasoningEffort: config.desiredReasoningEffort,
            runId,
            runtimeId: config.desiredRuntimeId,
        });
        await recordRunTrigger(tx, { agentId, runId, serverId: state.serverId }, first);
        const activity = await appendServerAgentActivity(tx, {
            agentId,
            category: 'starting_work',
            phase: 'started',
            runId,
            serverId: state.serverId,
        });
        return {
            ...(activity ? { activities: [activity] } : {}),
            computerId: config.computerId,
            claimEvents: await runLivenessClaimEvents(tx, {
                agentId,
                runId,
                serverId: state.serverId,
            }),
            frame: {
                agentId,
                ...startPromptFacts(config),
                agentName: config.agentName,
                chatId: first.chatId,
                drainItemIds: drainRows.map((row) => row.dedupeKey),
                ...(greets ? { greets: true as const } : {}),
                homeTimezone: config.homeTimezone,
                inbox: await buildInboxItems(tx, concrete ? selected : noticeRows, agentId),
                inboxDelivery: concrete ? 'concrete' : 'notice',
                modelId: config.desiredModelId,
                runId,
                runtimeId: config.desiredRuntimeId,
                sessionGeneration: config.sessionGeneration,
                totalPending: await store.countQueuedNoticeItems(tx, agentId),
                type: 'start',
                unreadElsewhere: await readUnreadElsewhere(tx, {
                    agentId,
                    drainedItemIds: [...drainRows, ...warmDrainRows].map((row) => row.id),
                    representedChatIds: chatIdsOf(noticeRows),
                    serverId: state.serverId,
                }),
                warmDrainItemIds: warmDrainRows.map((row) => row.dedupeKey),
            },
            serverId: state.serverId,
        };
    }

    private emit(plan: DispatchPlan | null): void {
        if (!plan) {
            return;
        }
        publishRealtime(plan.claimEvents ?? []);
        if (plan.yielded) {
            publishAgentLifecycle({
                agentId: plan.yielded.agentId,
                chatId: null,
                outcome: 'stopped',
                phase: 'settled',
                runId: plan.yielded.runId,
                serverId: plan.serverId,
            });
            this.transport.send(plan.yielded.computerId, {
                agentId: plan.yielded.agentId,
                runId: plan.yielded.runId,
                type: 'stop',
            });
        }
        for (const activity of plan.activities ?? []) {
            if (activity.category === 'starting_work' && activity.phase === 'started') {
                continue;
            }
            publishCommittedAgentActivity(activity);
        }
        if (plan.configuration) {
            sendDeferredConfiguration(
                this.transport,
                plan.configuration.agentId,
                plan.configuration
            );
        }
        if (plan.suppressSend) {
            return;
        }
        if (!this.transport.send(plan.computerId, plan.frame)) {
            return;
        }
        if (plan.frame.type === 'start') {
            publishAgentLifecycle({
                agentId: plan.frame.agentId,
                chatId: plan.frame.chatId,
                phase: 'working',
                runId: plan.frame.runId,
                serverId: plan.serverId,
            });
        }
    }

    /** Tells the live run's Computer and every viewer that a run was killed. */
    private announceKilledRun(
        input: { agentId: string; serverId: string },
        kill: NonNullable<Awaited<ReturnType<typeof interruptActiveRun>>>
    ) {
        publishRealtime(kill.claimEvents);
        if (kill.activity) {
            publishCommittedAgentActivity(kill.activity);
        }
        publishAgentLifecycle({
            agentId: input.agentId,
            chatId: kill.chatId,
            outcome: 'stopped',
            phase: 'settled',
            runId: kill.runId,
            serverId: input.serverId,
        });
        this.transport.send(kill.computerId, {
            agentId: input.agentId,
            runId: kill.runId,
            type: 'stop',
        });
        if (kill.configuration) {
            sendDeferredConfiguration(this.transport, input.agentId, kill.configuration);
        }
    }
}
