import type {
    Agent,
    AgentActivityEvent,
    AgentCommand,
    AgentInboxItem,
    AgentTurnSummary,
    CloudAgentWorkAttention,
    ReminderScriptCommand,
    ReminderScriptResult,
    ServerDurableEvent,
} from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
    messageSelection,
    targetForChat as targetForAgentChat,
    toAgentMessages,
} from '../agent-api/message-view.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import { readCloudAgentWorkAttentions } from '../cloud-agents/read-cloud-agent-work-attentions.ts';
import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentMessageDraftsTable, agentsTable, chatMessagesTable } from '../postgres/schema.ts';
import {
    listReminderScriptCommands,
    settleReminderScript,
} from '../reminders/reminder-script-delivery.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { readActiveAgentActivity } from '../server-agents/agent-activity-history.ts';
import type { AgentConfigurationRotation } from '../server-agents/configure-agent.ts';
import { recordAgentTurnSummary } from '../server-agents/record-agent-turn.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { runLivenessTaskEvents, settleAgentBackgroundClaims } from '../tasks/background-claims.ts';
import { listMessageTaskMap } from '../tasks/task-shape.ts';
import { publishCommittedAgentActivity } from './activity-events.ts';
import { canBeginAgentDrain, nextAgentChainTurns } from './chain-budget.ts';
import { advanceSeenForRun, markCursorSubsumedSeen, recordExactMessagesServed } from './cursors.ts';
import {
    configureFrame,
    type DeferredConfiguration,
    isConfigured,
    rotateDeferredConfiguration,
    sendDeferredConfiguration,
} from './deferred-configuration.ts';
import {
    type AgentConfigureRequest,
    type AgentDispatchConfig,
    listComputerAgents,
    readAgentDispatchConfig,
    reconcileConfigureFrame,
} from './dispatch-config.ts';
import { traceAgentDispatch } from './dispatch-telemetry.ts';
import { shouldRetryFailure } from './failure-policy.ts';
import { isConcreteInboxSource as isConcreteSource } from './inbox-lanes.ts';
import { inboxSender } from './inbox-sender.ts';
import { publishAgentLifecycle } from './lifecycle.ts';
import { isBackedOff, maxDeliveryFailures, nextRetryAt } from './retry-policy.ts';
import { recordSessionRotation } from './session-rotation.ts';
import type { AgentDeliveryRow } from './store.ts';
import * as store from './store.ts';

/** The Server→Computer wire, narrowed to what durable delivery needs. */
export interface DeliveryTransport {
    isOnline(computerId: string): boolean;
    send(computerId: string, frame: AgentCommand): boolean;
}

interface DispatchPlan {
    activities?: AgentActivityEvent[];
    computerId: string;
    configuration?: DeferredConfiguration;
    frame: AgentCommand;
    serverId: string;
    suppressSend?: boolean;
    /** `task.updated` for the tasks this run just made live. */
    taskEvents?: ServerDurableEvent[];
}

interface DispatchOptions {
    /** Resend even an acknowledged run — a reconnecting Computer lost its process. */
    resendActive?: boolean;
}

export interface EnqueueInput {
    agentId: string;
    chatId: string;
    content: string;
    /** Queue time for work with no Chat message of its own, such as an automation fire. */
    createdAt?: Date;
    /** Idempotency key; a duplicate delivery of the same message is a no-op. */
    dedupeKey: string;
    mentioned?: boolean;
    sequence?: number;
    serverId: string;
    source?: string;
    threadFollowReactivated?: boolean;
}

/** Bounds one drain so the composed prompt stays well under command/env limits. */
const maxDrainRows = 50;
const maxDrainChars = 24_000;

/**
 * Server-owned durable Agent delivery. PostgreSQL owns all run, stop, and pending-inbox state, so a restarted Server or reconnecting Computer resumes
 * without losing accepted work. Crash recovery is at least once, so lost
 * settlement evidence may repeat model-visible work. Agents serialize independently, and the
 * retry sweep resends unacknowledged
 * deliveries, reconnect reconciliation is idempotent, and a floating-session
 * run drains a bounded slice across all pending targets.
 */
export class AgentDelivery {
    private readonly db: HausDatabase;
    private readonly transport: DeliveryTransport;

    constructor(
        db: HausDatabase,
        transport: DeliveryTransport,
        private readonly runtime?: EffectRuntime<never>
    ) {
        this.db = db;
        this.transport = transport;
    }

    /**
     * Records inbound work durably, inside the caller's transaction so the
     * enqueue commits atomically with the message that produced it — a committed
     * message can never leave its wake unqueued. Dispatch to the wire is the
     * separate, recoverable step {@link dispatchAgent}.
     */
    async enqueue(tx: HausDatabase, input: EnqueueInput): Promise<void> {
        const source = input.source ?? 'human';
        await store.ensureDeliveryState(tx, { agentId: input.agentId, serverId: input.serverId });
        await store.enqueueInboxItem(tx, {
            agentId: input.agentId,
            chatId: input.chatId,
            content: input.content,
            ...(input.createdAt ? { createdAt: input.createdAt } : {}),
            dedupeKey: input.dedupeKey,
            mentioned: input.mentioned,
            serverId: input.serverId,
            source,
            threadFollowReactivated: input.threadFollowReactivated,
        });
        // Fresh work re-enables delivery. Human intent also releases the
        // Agent-authored chain ceiling even when older Agent rows precede it.
        await store.clearDeliveryFailures(tx, input.agentId);
        if (source === 'human') {
            await store.setAgentChainTurns(tx, { agentId: input.agentId, turns: 0 });
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
        this.emit(plan);
    }

    /** Best-effort wire dispatch for an Agent; durable state already committed. */
    async dispatchAgent(
        agentId: string,
        serverId: string,
        options?: DispatchOptions
    ): Promise<void> {
        const plan = await traceAgentDispatch(this.runtime, { agentId, serverId }, async () =>
            this.db.transaction(async (tx) => {
                await lockServerRow(tx, serverId);
                await store.ensureDeliveryState(tx, { agentId, serverId });
                return this.planDispatch(tx, agentId, options);
            })
        );
        this.emit(plan);
    }

    /**
     * Human Stop: persist the flag, revoke the live run's runner credential so the
     * Stop holds even if the Computer is offline or restarts, requeue the run's
     * work, and best-effort kill the live turn.
     */
    async stop(input: { agentId: string; serverId: string }): Promise<void> {
        const kill = await this.db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            const state = await store.readDeliveryState(tx, input.agentId);
            await store.setStopped(tx, { ...input, stopped: true });
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
        if (kill) {
            emitTaskEvents(kill.taskEvents);
            if (kill.activity) {
                publishCommittedAgentActivity(kill.activity);
            }
            if (kill.chatId) {
                publishAgentLifecycle({
                    agentId: input.agentId,
                    chatId: kill.chatId,
                    outcome: 'stopped',
                    phase: 'settled',
                    runId: kill.runId,
                    serverId: input.serverId,
                });
            }
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

    /** Human Start: clear the flag and any backoff, then drain the pending inbox. */
    async start(input: { agentId: string; serverId: string }): Promise<void> {
        const plan = await this.db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await store.setStopped(tx, { ...input, stopped: false });
            await store.clearDeliveryFailures(tx, input.agentId);
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
        const interrupted = await this.interruptActiveRun(input);
        if (interrupted) {
            emitTaskEvents(interrupted.taskEvents);
            if (interrupted.activity) {
                publishCommittedAgentActivity(interrupted.activity);
            }
            if (interrupted.chatId) {
                publishAgentLifecycle({
                    agentId: input.agentId,
                    chatId: interrupted.chatId,
                    outcome: 'stopped',
                    phase: 'settled',
                    runId: interrupted.runId,
                    serverId: input.serverId,
                });
            }
            this.transport.send(interrupted.computerId, {
                agentId: input.agentId,
                runId: interrupted.runId,
                type: 'stop',
            });
            if (interrupted.configuration) {
                sendDeferredConfiguration(this.transport, input.agentId, interrupted.configuration);
            }
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
            let taskEvents: ServerDurableEvent[] = [];
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
                taskEvents = await settleAgentBackgroundClaims(tx, killedRun(input, state));
                await store.clearActiveRun(tx, input.agentId);
            }
            await store.clearInboxNotices(tx, { agentId: input.agentId });
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
                taskEvents,
            };
        });
        emitTaskEvents(result.taskEvents);
        if (result.activity) {
            publishCommittedAgentActivity(result.activity);
        }
        if (!result.computerId) {
            return;
        }
        if (result.runId) {
            if (result.chatId) {
                publishAgentLifecycle({
                    agentId: input.agentId,
                    chatId: result.chatId,
                    outcome: 'stopped',
                    phase: 'settled',
                    runId: result.runId,
                    serverId: input.serverId,
                });
            }
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
        if (state?.activeRunId === input.runId && state.activeRunChatId) {
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
        const serverId = await store.readAgentServerId(this.db, input.agentId);
        if (!serverId) {
            return;
        }
        await this.db.transaction(async (tx) => {
            await lockServerRow(tx, serverId);
            const state = await store.readDeliveryState(tx, input.agentId);
            if (state?.activeRunId !== input.runId || state.acceptedAt === null) {
                return;
            }
            const queued = await store.listQueuedItems(tx, input.agentId, 1000);
            await store.markInboxItemsNoticed(tx, {
                agentId: input.agentId,
                itemIds: queued
                    .filter((row) => input.workIds.includes(row.dedupeKey))
                    .map((row) => row.id),
                runId: input.runId,
            });
        });
    }

    /** A run settled on the Computer: consume or requeue its work, then drain when eligible. */
    async onTurnSettled(computerId: string, summary: AgentTurnSummary): Promise<void> {
        await recordAgentTurnSummary(this.db, computerId, summary);
        const serverId = await store.readAgentServerId(this.db, summary.agentId);
        if (!serverId) {
            return;
        }
        if (summary.failureKind === 'session-resume' && !summary.outputProduced) {
            const recovery = await this.db.transaction(async (tx) => {
                await lockServerRow(tx, serverId);
                const state = await store.readDeliveryState(tx, summary.agentId);
                if (
                    state?.activeRunId !== summary.runId ||
                    state.activeRunComputerId !== computerId ||
                    !state.activeRunChatId
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
                const taskEvents = await runLivenessTaskEvents(tx, {
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
                await store.clearDeliveryFailures(tx, summary.agentId);
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
                    taskEvents,
                };
            });
            if (!recovery) {
                return;
            }
            emitTaskEvents(recovery.taskEvents);
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
            // Only a turn that ran to completion can close a claim it answered.
            completed: summary.status === 'completed',
            runId: summary.runId,
            serverId,
        };
        const settlement = await this.db.transaction(async (tx) => {
            await lockServerRow(tx, serverId);
            const state = await store.readDeliveryState(tx, summary.agentId);
            if (
                state?.activeRunId !== summary.runId ||
                state.activeRunComputerId !== computerId ||
                !state.activeRunChatId
            ) {
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
                await store.clearDeliveryFailures(tx, summary.agentId);
                await store.setAgentChainTurns(tx, {
                    agentId: summary.agentId,
                    turns: nextAgentChainTurns(budgetRows, state.agentChainTurns),
                });
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
                const taskEvents = await settleAgentBackgroundClaims(tx, runScope);
                await store.clearActiveRun(tx, summary.agentId);
                return {
                    activity,
                    chatId,
                    configuration,
                    plan: await this.planDispatch(tx, summary.agentId),
                    taskEvents,
                };
            }
            // A failed turn that produced model-visible output must not requeue
            // its work — redelivering it would re-trigger that output. Only a
            // failure with no output is safe to retry. Either way it does not
            // re-drive immediately: repeated failures back off, then degrade.
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
            const taskEvents = await settleAgentBackgroundClaims(tx, runScope);
            await store.clearActiveRun(tx, summary.agentId);
            const retryable = shouldRetryFailure(summary.failureKind);
            const failures = retryable ? state.consecutiveFailures + 1 : maxDeliveryFailures;
            await store.recordDeliveryFailure(tx, {
                agentId: summary.agentId,
                consecutiveFailures: failures,
                retryAfter:
                    retryable && failures < maxDeliveryFailures ? nextRetryAt(failures) : null,
            });
            return { activity, chatId, configuration, plan: null, taskEvents };
        });
        if (!settlement) {
            return;
        }
        emitTaskEvents(settlement.taskEvents);
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
                if (rotation.chatId) {
                    publishAgentLifecycle({
                        agentId: agent.id,
                        chatId: rotation.chatId,
                        outcome: 'stopped',
                        phase: 'settled',
                        runId: rotation.runId,
                        serverId: agent.serverId,
                    });
                }
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
        const candidates = await store.listDispatchCandidates(this.db, maxDeliveryFailures);
        for (const candidate of candidates) {
            await this.dispatchAgent(candidate.agentId, candidate.serverId);
        }
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
                    frame.inbox.length === 0
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
            const unnoticed = (
                await store.listUnnoticedQueuedItems(tx, agentId, maxDrainRows)
            ).filter((row) => row.source !== 'onboarding');
            if (unnoticed.length > 0) {
                const pending = noticeWindow(
                    (await store.listQueuedItems(tx, agentId, 1000)).filter(
                        (row) => row.source !== 'onboarding'
                    ),
                    unnoticed
                );
                return {
                    computerId: state.activeRunComputerId,
                    frame: {
                        agentId,
                        inbox: await buildInboxItems(tx, pending),
                        runId: state.activeRunId,
                        totalPending: await store.countQueuedNoticeItems(tx, agentId),
                        type: 'notice',
                    },
                    serverId: state.serverId,
                };
            }
            return null;
        }
        if (isBackedOff(state)) {
            return null;
        }
        // Sequential: planning runs inside the transaction holding the Server
        // row, and overlapping reads on its one connection wedge it.
        const unnoticed = await store.listUnnoticedQueuedItems(tx, agentId, maxDrainRows);
        const concreteRows = await store.listQueuedConcreteItems(tx, agentId, maxDrainRows);
        const candidates = [
            ...new Map([...unnoticed, ...concreteRows].map((row) => [row.id, row])).values(),
        ];
        // Concrete work leads its own run: its envelope exists nowhere but the
        // inbox, so it enters the first prompt instead of waiting behind a
        // notice the Agent may never pull.
        const first =
            candidates.find((row) => row.source === 'onboarding') ??
            candidates.find((row) => isConcreteSource(row.source)) ??
            candidates[0];
        if (!first) {
            return null;
        }
        if (!canBeginAgentDrain(candidates, state.agentChainTurns)) {
            return null;
        }
        const runId = createOpaqueId('run');
        const concrete = isConcreteSource(first.source);
        const selected = boundedCompatibleRows(candidates, first.source);
        let noticeRows: store.InboxItemRow[] = [];
        if (concrete) {
            await store.attachQueuedItemsToRun(tx, {
                agentId,
                itemIds: selected.map((row) => row.id),
                runId,
            });
        } else {
            noticeRows = noticeWindow(
                (await store.listQueuedItems(tx, agentId, 1000)).filter(
                    (row) => !isConcreteSource(row.source)
                ),
                selected
            );
            await store.markInboxItemsNoticed(tx, {
                agentId,
                initial: true,
                itemIds: noticeRows.map((row) => row.id),
                runId,
            });
        }
        const chatId = first.chatId;
        // Freeze execution configuration onto the run so every resend uses these values.
        await store.beginActiveRun(tx, {
            agentId,
            chatId,
            computerId: config.computerId,
            modelId: config.desiredModelId,
            reasoningEffort: config.desiredReasoningEffort,
            runId,
            runtimeId: config.desiredRuntimeId,
        });
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
            taskEvents: await runLivenessTaskEvents(tx, {
                agentId,
                runId,
                serverId: state.serverId,
            }),
            frame: {
                agentId,
                ...(config.agentDescription ? { agentDescription: config.agentDescription } : {}),
                agentName: config.agentName,
                chatId,
                homeTimezone: config.homeTimezone,
                inbox: await buildInboxItems(tx, concrete ? selected : noticeRows),
                inboxDelivery: concrete ? 'concrete' : 'notice',
                modelId: config.desiredModelId,
                runId,
                runtimeId: config.desiredRuntimeId,
                sessionGeneration: config.sessionGeneration,
                totalPending: concrete ? 0 : await store.countQueuedNoticeItems(tx, agentId),
                type: 'start',
            },
            serverId: state.serverId,
        };
    }

    private emit(plan: DispatchPlan | null): void {
        if (!plan) {
            return;
        }
        emitTaskEvents(plan.taskEvents ?? []);
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

    private async interruptActiveRun(input: { agentId: string; serverId: string }) {
        return await this.db.transaction(async (tx) => {
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
}

/**
 * A run a human killed — Stop, Restart, or Reset — settles like a failed turn:
 * nothing it managed to say counts as an answer, so the background claims it
 * still holds are stamped tracked instead of closed.
 */
function killedRun(
    input: { agentId: string; serverId: string },
    state: { activeRunId: string | null }
) {
    return {
        agentId: input.agentId,
        completed: false,
        runId: state.activeRunId ?? '',
        serverId: input.serverId,
    };
}

function emitTaskEvents(events: ServerDurableEvent[]): void {
    for (const event of events) {
        emitDurableChatEvent({ audienceUserId: null, event });
    }
}

async function startFrame(
    db: HausDatabase,
    state: AgentDeliveryRow,
    config: Pick<
        AgentDispatchConfig,
        'agentDescription' | 'agentName' | 'homeTimezone' | 'sessionGeneration'
    >
): Promise<AgentCommand> {
    const runRows = state.activeRunId
        ? await store.listInboxItemsForRun(db, {
              agentId: state.agentId,
              runId: state.activeRunId,
          })
        : [];
    const noticeRows =
        runRows.length === 0 && state.activeRunId
            ? (
                  await store.listNoticedItemsForRun(db, {
                      agentId: state.agentId,
                      runId: state.activeRunId,
                  })
              ).filter((row) => row.source !== 'onboarding')
            : [];
    return {
        agentId: state.agentId,
        ...(config.agentDescription ? { agentDescription: config.agentDescription } : {}),
        agentName: config.agentName,
        chatId: state.activeRunChatId ?? '',
        homeTimezone: config.homeTimezone,
        inbox: await buildInboxItems(db, runRows.length > 0 ? runRows : noticeRows),
        inboxDelivery: runRows.length > 0 ? 'concrete' : 'notice',
        modelId: state.activeRunModelId ?? '',
        runId: state.activeRunId ?? '',
        runtimeId: state.activeRunRuntimeId ?? '',
        sessionGeneration: config.sessionGeneration,
        totalPending:
            runRows.length > 0 ? 0 : await store.countQueuedNoticeItems(db, state.agentId),
        type: 'start',
    };
}

/**
 * One drain never mixes the lanes, and a concrete drain never mixes kinds: a
 * fire, a task assignment, a Cloud Agent result, and Cove's bootstrap each earn
 * their own dedicated wake, which is also what keeps the sole-fire cause
 * inference readable (specs/inbox.md).
 */
function boundedCompatibleRows(rows: store.InboxItemRow[], source: string) {
    const selected: store.InboxItemRow[] = [];
    let chars = 0;
    for (const row of rows) {
        if (isConcreteSource(source) ? row.source !== source : isConcreteSource(row.source)) {
            continue;
        }
        const nextChars = chars + row.content.length;
        if (selected.length > 0 && (selected.length >= maxDrainRows || nextChars > maxDrainChars)) {
            break;
        }
        selected.push(row);
        chars = nextChars;
    }
    return selected;
}

function noticeWindow(
    queued: store.InboxItemRow[],
    mustInclude: store.InboxItemRow[]
): store.InboxItemRow[] {
    const selected = new Map(mustInclude.map((row) => [row.id, row]));
    for (const row of queued) {
        if (selected.size >= maxDrainRows) {
            break;
        }
        selected.set(row.id, row);
    }
    return [...selected.values()].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    );
}

async function attachSummaryVisibility(
    db: HausDatabase,
    state: AgentDeliveryRow,
    identities: AgentTurnSummary['visibleMessages'] | undefined
) {
    if (!(state.activeRunId && identities && identities.length > 0)) {
        return;
    }
    const rows = await store.listInboxItemsByDedupeKeys(db, {
        agentId: state.agentId,
        dedupeKeys: identities.map((identity) => identity.id),
        runId: state.activeRunId,
    });
    const byMessageId = new Map(rows.map((row) => [row.dedupeKey, row]));
    const messages = await db
        .select({
            chatId: chatMessagesTable.chatId,
            id: chatMessagesTable.id,
            sequence: chatMessagesTable.sequence,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, state.serverId),
                inArray(
                    chatMessagesTable.id,
                    identities.map((identity) => identity.id)
                )
            )
        );
    const messageById = new Map(messages.map((message) => [message.id, message]));
    const attachableIds: string[] = [];
    const visibleMessages: Array<{ chatId: string; id: string }> = [];
    for (const identity of identities) {
        const row = byMessageId.get(identity.id);
        const message = messageById.get(identity.id);
        if (message?.sequence !== identity.sequence || message.chatId !== identity.chatId) {
            continue;
        }
        visibleMessages.push({ chatId: message.chatId, id: message.id });
        if (row?.chatId === identity.chatId) {
            attachableIds.push(row.id);
        }
    }
    await store.attachQueuedItemsToRun(db, {
        agentId: state.agentId,
        itemIds: attachableIds,
        runId: state.activeRunId,
    });
    await recordExactMessagesServed(db, {
        agentId: state.agentId,
        messages: visibleMessages,
        runId: state.activeRunId,
        serverId: state.serverId,
    });
}

async function buildInboxItems(
    db: HausDatabase,
    rows: store.InboxItemRow[]
): Promise<AgentInboxItem[]> {
    const serverId = rows[0]?.serverId;
    const messageIds = rows.map((row) => row.dedupeKey).filter((id) => id.startsWith('msg_'));
    const messageRows =
        serverId && messageIds.length > 0
            ? await db
                  .select(messageSelection)
                  .from(chatMessagesTable)
                  .where(
                      and(
                          eq(chatMessagesTable.serverId, serverId),
                          inArray(chatMessagesTable.id, messageIds)
                      )
                  )
            : [];
    const apiMessages = serverId ? await toAgentMessages(db, serverId, messageRows) : [];
    const apiMessageById = new Map(apiMessages.map((message) => [message.id, message]));
    const cloudAgentWorkByRun =
        serverId && rows.some((row) => row.source === 'cloud_agent_work')
            ? await readCloudAgentWorkAttentions(
                  db,
                  serverId,
                  rows
                      .filter((row) => row.source === 'cloud_agent_work')
                      .map((row) => row.dedupeKey)
              )
            : new Map<string, CloudAgentWorkAttention>();
    const sequenceByMessageId = new Map(
        messageRows.map((message) => [message.id, message.sequence])
    );
    const taskByMessage = serverId
        ? await listMessageTaskMap(
              db,
              serverId,
              rows.map((row) => row.dedupeKey)
          )
        : new Map();
    const targetByChatId = new Map<string, string>();
    for (const chatId of new Set(rows.map((row) => row.chatId))) {
        targetByChatId.set(
            chatId,
            serverId ? await targetForAgentChat(db, serverId, chatId) : '#unknown'
        );
    }
    return rows.map((row) => {
        const cloudAgentWork =
            row.source === 'cloud_agent_work' ? cloudAgentWorkByRun.get(row.dedupeKey) : undefined;
        if (row.source === 'cloud_agent_work' && !cloudAgentWork) {
            throw new Error(`Cloud Agent attention ${row.dedupeKey} is missing.`);
        }
        const attention = cloudAgentWork;
        const target = targetByChatId.get(row.chatId) ?? '#unknown';
        const apiMessage = apiMessageById.get(row.dedupeKey);
        const sender = inboxSender({
            source: row.source,
            target,
            attention: Boolean(attention),
            message: apiMessage,
        });
        return {
            chatId: row.chatId,
            content: attention ? '' : row.content,
            createdAt: row.createdAt.toISOString(),
            id: row.dedupeKey,
            ...(cloudAgentWork ? { cloudAgentWork } : {}),
            ...(apiMessage?.ask
                ? {
                      ask: {
                          addresseeHandle: apiMessage.ask.addressee_handle,
                          status: apiMessage.ask.status,
                      },
                  }
                : {}),
            ...(apiMessage ? { message: apiMessage } : {}),
            ...(row.mentioned ? { mentioned: true } : {}),
            ...(row.threadFollowReactivated ? { threadFollowReactivated: true } : {}),
            ...(apiMessage?.sender.description
                ? { senderDescription: apiMessage.sender.description }
                : {}),
            ...sender,
            sequence: attention ? 0 : (sequenceByMessageId.get(row.dedupeKey) ?? 1),
            ...(taskByMessage.get(row.dedupeKey) ? { task: taskByMessage.get(row.dedupeKey) } : {}),
            target,
        };
    });
}
