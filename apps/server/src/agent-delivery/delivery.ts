import {
    type Agent,
    type AgentActivityEvent,
    type AgentCommand,
    type AgentTurnSummary,
    isBatchedChatlessInboxSource,
    isChatlessInboxSource,
    type ReminderScriptCommand,
    type ReminderScriptResult,
} from '@haus/api';
import type { EffectRuntime } from '@haus/effect';
import type { MachineChangeStep } from '../agent-machine/advance-machine-change.ts';
import {
    advanceAgentMachine,
    advancePendingMachines,
    commitMachineSteps,
    type MachineChangeDeps,
} from '../agent-machine/machine-change-delivery.ts';
import { type MachineFences, unfencedMachines } from '../agent-machine/machine-change-effects.ts';
import { machineChangeHolds } from '../agent-machine/machine-change-read.ts';
import { invalidateFlush } from '../agent-machine/machine-change-store.ts';
import { retireOnServerComputers } from '../computers/agent-retirement.ts';
import { revokeRunnerCredentialsForRun } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { settleReminderScript } from '../reminders/reminder-script-delivery.ts';
import { sendReminderScript } from '../reminders/reminder-script-placement.ts';
import { recordReminderWakeUsage } from '../reminders/reminder-wake-usage.ts';
import { readActiveAgentActivity } from '../server-agents/agent-activity-history.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import type { AgentConfigurationRotation } from '../server-agents/configure-agent.ts';
import { recordAgentTurnSummary, recordRunTrigger } from '../server-agents/record-agent-turn.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { abandonsResentRun } from './abandoned-run.ts';
import { listActiveRunAgents } from './active-runs.ts';
import { publishCommittedAgentActivity } from './activity-events.ts';
import { planBusyNotice } from './busy-notice.ts';
import { admitQueuedAgentDrain, restartIdleAgentChain } from './chain-budget.ts';
import { planChatlessRun } from './chatless-run.ts';
import { reconcileComputerAgents } from './computer-reconnect.ts';
import { applyConfiguration, sendAgentConfiguration } from './configuration-apply.ts';
import { markCursorSubsumedSeen } from './cursors.ts';
import {
    configureFrame,
    type DeferredConfiguration,
    isConfigured,
    rotateDeferredConfiguration,
    sendDeferredConfiguration,
} from './deferred-configuration.ts';
import {
    type AgentConfigureRequest,
    readAgentDispatchConfig,
    startPromptFacts,
} from './dispatch-config.ts';
import { dispatchEach } from './dispatch-each.ts';
import { traceAgentDispatch } from './dispatch-telemetry.ts';
import {
    chatIdsOf,
    claimRunItems,
    drainRowsFor,
    readDrainCandidates,
    startFrame,
} from './drain-selection.ts';
import type { EnqueueInput } from './enqueue-input.ts';
import * as failureHold from './failure-hold.ts';
import { buildInboxItems } from './inbox-items.ts';
import { isConcreteInboxSource as isConcreteSource } from './inbox-lanes.ts';
import { inboxWork } from './inbox-work.ts';
import { killActiveRun } from './kill-active-run.ts';
import { publishAgentLifecycle } from './lifecycle.ts';
import {
    type AgentLoopHost,
    AgentLoopRoute,
    type LoopFrame,
    offlineRunner,
    type RunnerWire,
    startOf,
} from './loop-host.ts';
import { consumeNoticeAck } from './notice-ack.ts';
import { type AgentResetRequest, resetInTransaction } from './reset-transaction.ts';
import { isBackedOff } from './retry-policy.ts';
import { startRun } from './run-start.ts';
import * as store from './store.ts';
import { recoverSessionResume, settleRun } from './turn-settlement.ts';
import { isolateUnrenderableItems } from './undeliverable-items.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/** The Server→Computer wire, narrowed to what durable delivery needs. */
export interface DeliveryTransport {
    isOnline(computerId: string): boolean;
    send(computerId: string, frame: AgentCommand): boolean;
}

export interface DispatchPlan {
    activities?: AgentActivityEvent[];
    /** What a run's start publishes after commit (see `startRun`). */
    startEvents?: PreparedRealtimeEvent[];
    computerId: string;
    configuration?: DeferredConfiguration;
    frame: LoopFrame;
    /** The Agent's placement generation, set when a run's start is bound for the runner. */
    placementGeneration?: number;
    serverId: string;
    suppressSend?: boolean;
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
    readonly route: AgentLoopRoute;

    constructor(
        private readonly db: HausDatabase,
        private readonly transport: DeliveryTransport,
        readonly runtime?: EffectRuntime<never>,
        runner: RunnerWire = offlineRunner,
        private readonly fences: MachineFences = unfencedMachines
    ) {
        this.route = new AgentLoopRoute(transport, runner);
    }

    /** Moves the Agent's pending Machine change a step (ADR 0057 decision 7). */
    async advanceMachineChange(agentId: string) {
        await advanceAgentMachine(this.machineDeps(), { agentId });
    }

    /** Commits Machine switches made inside another transaction, such as a Device removal. */
    async commitMachineSteps(steps: readonly MachineChangeStep[]) {
        await commitMachineSteps(this.machineDeps(), steps);
    }

    /**
     * Records inbound work durably, inside the caller's transaction so the
     * enqueue commits atomically with the message that produced it — a committed
     * message can never leave its wake unqueued. Dispatch to the wire is the
     * separate, recoverable step {@link dispatchAgent}.
     */
    async enqueue(tx: HausDatabase, input: EnqueueInput): Promise<void> {
        const source = input.source ?? 'human';
        await inboxWork.enqueue(tx, { ...input, source });
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
        await this.killActiveRun(input, { stop: true });
        const config = await readAgentDispatchConfig(this.db, input.agentId);
        if (config?.computerId) {
            this.transport.send(config.computerId, {
                agentId: input.agentId,
                type: 'agent-stop-background',
            });
        }
        await this.advanceMachineChange(input.agentId);
    }

    /** A Task message sent with `interrupt` (ADR 0062): kill the live turn and run again. */
    async interrupt(input: { agentId: string; serverId: string }): Promise<void> {
        await this.killActiveRun(input);
        await this.dispatchAgent(input.agentId, input.serverId);
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
        const host = config?.computerId ? this.route.hostOf(config.computerId) : null;
        if (!(host && this.route.isOnline(host))) {
            throw new Error('The runner must be online to restart this Agent.');
        }
        await this.killActiveRun(input);
        if (!this.route.send(host, { agentId: input.agentId, type: 'agent-restart' })) {
            throw new Error('The runner disconnected before the Agent could restart.');
        }
        await this.start(input);
    }

    /** Rotates session identity; full reset also recreates Computer-local Agent state. */
    async reset(input: AgentResetRequest) {
        const result = await resetInTransaction(this.db, input);
        if (result.deletedArtifacts > 0) {
            artifactUpdatedTopic.announce({ artifactId: null, serverId: input.serverId });
        }
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
            this.route.send(this.route.hostOf(result.computerId), {
                agentId: input.agentId,
                runId: result.runId,
                type: 'stop',
            });
        }
        if (result.configuration) {
            sendDeferredConfiguration(this.transport, input.agentId, result.configuration);
        }
        const reset = { kind: input.kind, sessionGeneration: result.sessionGeneration };
        this.transport.send(result.computerId, {
            ...reset,
            agentId: input.agentId,
            type: 'agent-reset',
        });
        this.route.toRunner({ ...reset, agentId: input.agentId, type: 'agent-reset' });
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

    /** A run settled on the runner, for the Agent's machine `computerId`. */
    async onTurnSettled(computerId: string, summary: AgentTurnSummary): Promise<void> {
        await this.onHostedTurnSettled({ kind: 'runner', machineId: computerId }, summary);
    }

    /**
     * A run settled on `host`: consume or requeue its work, then drain when
     * eligible. Only the host of the Agent's active run can settle it.
     */
    async onHostedTurnSettled(host: AgentLoopHost, summary: AgentTurnSummary): Promise<void> {
        const recordingComputerId =
            host.machineId ?? (await readAgentDispatchConfig(this.db, summary.agentId))?.computerId;
        if (recordingComputerId) {
            await recordAgentTurnSummary(this.db, recordingComputerId, summary);
        }
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
                const state = await this.lockSettlingRun(tx, host, serverId, summary);
                if (!state) {
                    return null;
                }
                const recovered = await recoverSessionResume(tx, { serverId, state, summary });
                return { ...recovered, plan: await this.planDispatch(tx, summary.agentId) };
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
            await this.advanceMachineChange(summary.agentId);
            return;
        }
        const settlement = await this.db.transaction(async (tx) => {
            const state = await this.lockSettlingRun(tx, host, serverId, summary);
            if (!state) {
                return null;
            }
            const settled = await settleRun(tx, { serverId, state, summary });
            return {
                ...settled,
                plan:
                    summary.status === 'completed'
                        ? await this.planDispatch(tx, summary.agentId)
                        : null,
            };
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
        if (settlement.crewReport) {
            await this.dispatchAgent(settlement.crewReport.agentId, settlement.crewReport.serverId);
        }
        await this.advanceMachineChange(summary.agentId);
    }

    /**
     * A Computer (re)connected: resend every in-flight run — acknowledged or not —
     * because the Computer may have lost its live turn, then drain queued work.
     * A live daemon suppresses concurrent duplicates. After process loss, an
     * accepted-but-unsettled run intentionally replays at least once.
     */
    async onComputerReconnect(computerId: string): Promise<void> {
        await reconcileComputerAgents(this.machineDeps(), computerId);
        await advancePendingMachines(this.machineDeps(), { fromComputerId: computerId });
    }

    /**
     * The runner (re)attached: like a Computer reconnect, resend every in-flight
     * run, because a restarted runner lost its live turns, then drain queued work.
     */
    async onRunnerReconnect(): Promise<void> {
        await dispatchEach(
            {
                dispatchAgent: (agentId, serverId) =>
                    this.dispatchAgent(agentId, serverId, { resendActive: true }),
            },
            await listActiveRunAgents(this.db)
        );
        await this.sweep();
    }

    /** Best-effort cleanup on every online Computer; `agent-held` replays it on reconnect. */
    retireAgent(input: { agentId: string; serverId: string }) {
        return retireOnServerComputers(this.db, this.transport, input);
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
        await applyConfiguration(
            {
                configure: (request) => this.configureAgent(request),
                dispatchAgent: (agentId, serverId) => this.dispatchAgent(agentId, serverId),
                route: this.route,
            },
            input
        );
    }

    /** Best-effort immediate apply; reconnect reconciliation resends the full snapshot. */
    async configureAgent(input: AgentConfigureRequest): Promise<void> {
        await sendAgentConfiguration(this.db, this.transport, input);
    }

    async dispatchReminderScript(input: { command: ReminderScriptCommand; computerId: string }) {
        await sendReminderScript(this.db, this.transport, input.computerId, input.command);
    }

    async onReminderScriptResult(computerId: string, result: ReminderScriptResult): Promise<void> {
        await settleReminderScript(
            this.db,
            computerId,
            result,
            async (tx, input) => await this.enqueue(tx, input)
        );
        await this.advanceMachineChange(result.agentId);
        const serverId = await store.readAgentServerId(this.db, result.agentId);
        if (serverId) {
            await this.dispatchAgent(result.agentId, serverId);
        }
    }

    /** Periodic reconciliation: resend unacknowledged deliveries, drain stragglers. */
    async sweep(): Promise<void> {
        await advancePendingMachines(this.machineDeps());
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
        const plan = await this.planDispatchFrame(tx, agentId, options);
        return plan ? await this.route.bindRunCredential(tx, plan) : null;
    }

    private async planDispatchFrame(
        tx: HausDatabase,
        agentId: string,
        options?: DispatchOptions
    ): Promise<DispatchPlan | null> {
        const state = await store.readDeliveryState(tx, agentId);
        const config = await readAgentDispatchConfig(tx, agentId);
        if (!(state && isConfigured(config)) || state.stopped) {
            return null;
        }
        // An Agent waits, inbox intact, until the runner is up and the Agent is cut over to it.
        if (!(await this.route.canStart(tx, agentId))) {
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
                if (await abandonsResentRun(tx, { agentId, frame, serverId: state.serverId })) {
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
                    await revokeRunnerCredentialsForRun(tx, {
                        agentId,
                        runId: state.activeRunId,
                        serverId: state.serverId,
                    });
                    await store.clearActiveRun(tx, agentId);
                    const next = await this.planDispatchFrame(tx, agentId);
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
        if (await this.holdsNewRun(tx, state)) {
            return null;
        }
        const { candidates, lead: preferred, mayLead } = await readDrainCandidates(tx, agentId);
        if (!preferred) {
            return null;
        }
        const chainTurns = await restartIdleAgentChain(tx, agentId, state.agentChainTurns);
        const drain = { agentId, candidates, chainTurns, lead: preferred };
        const admitted = await admitQueuedAgentDrain(tx, drain, drainRowsFor);
        if (!(admitted && mayLead(admitted.lead))) {
            return null;
        }
        await invalidateFlush(tx, { agentId, serverId: state.serverId });
        const first = admitted.lead;
        // Chatless work runs alone, except Issue items of one kind, which coalesce into one run.
        if (isChatlessInboxSource(first.source)) {
            const rows = isBatchedChatlessInboxSource(first.source) ? admitted.selected : [first];
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
        const startEvents = await startRun(tx, {
            agentId,
            chatId: first.chatId,
            computerId: config.computerId,
            modelId: config.desiredModelId,
            reasoningEffort: config.desiredReasoningEffort,
            runId,
            runtimeId: config.desiredRuntimeId,
            serverId: state.serverId,
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
            startEvents,
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

    /**
     * Locks the Server and returns the Agent's delivery state only while `host`
     * still hosts the summarized run. A stale or duplicate summary for an
     * already-cleared run gets null: its durable record upsert is the only effect.
     */
    private async lockSettlingRun(
        tx: HausDatabase,
        host: AgentLoopHost,
        serverId: string,
        summary: AgentTurnSummary
    ) {
        await lockServerRow(tx, serverId);
        const state = await store.readDeliveryState(tx, summary.agentId);
        return state?.activeRunId === summary.runId &&
            this.route.hosts(state.activeRunComputerId, host)
            ? state
            : null;
    }

    private emit(plan: DispatchPlan | null): void {
        if (!plan) {
            return;
        }
        publishRealtime(plan.startEvents ?? []);
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
        if (
            !this.route.send(
                this.route.hostOf(plan.computerId),
                plan.frame,
                plan.placementGeneration
            )
        ) {
            return;
        }
        const start = startOf(plan.frame);
        if (start) {
            publishAgentLifecycle({
                agentId: start.agentId,
                chatId: start.chatId,
                phase: 'working',
                runId: start.runId,
                serverId: plan.serverId,
            });
        }
    }

    private async killActiveRun(
        input: { agentId: string; serverId: string },
        options?: { stop: boolean }
    ) {
        await killActiveRun(
            { db: this.db, route: this.route, transport: this.transport },
            input,
            options
        );
    }

    private async holdsNewRun(tx: HausDatabase, state: store.AgentDeliveryRow) {
        const isOnline = (computerId: string) => this.transport.isOnline(computerId);
        return isBackedOff(state) || (await machineChangeHolds(tx, { ...state, isOnline }));
    }

    private machineDeps() {
        return {
            db: this.db,
            dispatchAgent: (agentId: string, serverId: string) =>
                this.dispatchAgent(agentId, serverId),
            fences: this.fences,
            transport: this.transport,
        } satisfies MachineChangeDeps;
    }
}
