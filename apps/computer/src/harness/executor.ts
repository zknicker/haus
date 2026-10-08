import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { HarnessV1 } from '@ai-sdk/harness';
import type {
    HarnessAgent,
    HarnessAgentResumeSessionState,
    HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { type AgentReasoningEffort, hausAgentVersion } from '@haus/api';
import type { ClaudeUsageSnapshot } from '@haus/claude-usage';
import { settle } from '@haus/effect';
import { Cause, Effect, Exit } from 'effect';
import type { AgentActivityRun } from '../agent-activity-run.ts';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { StoredNoticeReceipt } from '../delivery.ts';
import {
    clearManagedSkillChangeNotice,
    readManagedSkillChangeNotice,
} from '../managed-skill-changes.ts';
import {
    claimClaudeSdkUsageRefresh,
    saveClaudePlanUsageSnapshot,
} from '../usage/claude-plan-usage-state.ts';
import { createHarnessActivityProjector } from './activity-projector.ts';
import { fingerprintHarnessBootstrap, refreshHarnessBootstrap } from './bootstrap-refresh.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { clearPendingCoveGuidanceRefresh } from './cove-guidance-refresh.ts';
import { prepareCoveGuidanceForTurn } from './cove-guidance-turn.ts';
import { createHarnessAgent, sandboxOptions } from './create-agent.ts';
import {
    type ComputerExecutionJournal,
    createComputerExecutionJournal,
} from './execution-journal.ts';
import { composeAgentInstructions } from './instructions.ts';
import { takeMemorySizeNotice } from './memory-size-notice.ts';
import { AgentSessionResumeRejectedError, isPromptResumeRejection } from './resume-rejection.ts';
import { projectMessageForAgent } from './rich-reference-projection.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { type HarnessSessionLease, harnessSessionOwner } from './session-lifecycle.ts';
import { clearSessionRestartRequest, isSessionRestartRequested } from './session-restart.ts';
import { startHarnessSession } from './session-start.ts';
import {
    type AgentSessionState,
    readAgentSessionState,
    resolveTurnSession,
    resumedTurnSession,
    writeAgentSessionState,
    writeFailedTurnSession,
} from './session-store.ts';
import { readAgentSkills } from './skills.ts';
import { createNoticeDelivery } from './steer-inbox-notice.ts';
import { settleStoppedTurn } from './stopped-turn.ts';
import { createNoticeCoordinator, deliverStoredNotice } from './stored-notice.ts';
import type { HarnessTokenUsage } from './token-usage.ts';
import { createTurnPhaseLog } from './turn-phase-log.ts';
import { attestComposedDrain, composeTurnPrompt, type TurnDelivery } from './turn-prompt.ts';
import { HarnessStreamForeignError, observeTurnStream } from './turn-stream.ts';

/** Drives one isolated, persistent Codex, Claude Code, Grok Build, or Pi Agent session. */
export interface HarnessTurnInput extends TurnDelivery {
    activity: AgentActivityRun;
    agentName: string;
    agentRoot: string;
    conversationStyle?: string | null;
    env: Record<string, string>;
    factoryKind: 'cove' | 'ordinary';
    /** Per-turn construction seam for boundary tests; production uses the default Harness Agent. */
    harnessAgentFactory?: HarnessAgentFactory;
    homeDir: string;
    initialRole: string | null;
    modelId: string;
    onStoredNoticeDelivered?: (receipt: StoredNoticeReceipt) => void;
    reasoningEffort: AgentReasoningEffort;
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    runtimeId: string;
    sessionGeneration: number;
    signal?: AbortSignal;
    signatureEmoji?: string | null;
    skillsDir: string;
    thoughts?: import('./thought-narrator.ts').AgentThoughtNarrator;
    tools: ToolSet;
    turnTimings?: AgentTurnTimings;
    webAccess: 'fetch-only' | 'search' | 'search-only' | null;
    workspaceDir: string;
}

export type NoticeSinkRegistrar = (sink: (notice: string) => Promise<boolean>) => () => void;

export interface HarnessTurnResult {
    aborted: boolean;
    claudePlanUsage: ClaudeUsageSnapshot | null;
    contextTokens: number | null;
    /** The no-progress deadline, not a Stop, interrupted the turn. */
    stalled?: boolean;
    tokenUsage: HarnessTokenUsage | null;
}

export type { HarnessTokenUsage } from './token-usage.ts';
export { HarnessTurnFailedError } from './turn-stream.ts';

function journalOutcome(
    exit: Exit.Exit<HarnessTurnResult, HarnessStreamForeignError>,
    signal?: AbortSignal
): 'completed' | 'failed' | 'interrupted' {
    if (Exit.isSuccess(exit)) {
        return exit.value.aborted ? 'interrupted' : 'completed';
    }
    return signal?.aborted || Cause.isInterruptedOnly(exit.cause) ? 'interrupted' : 'failed';
}

function journalError(exit: Exit.Exit<HarnessTurnResult, HarnessStreamForeignError>) {
    return Exit.isFailure(exit)
        ? Cause.pretty(Cause.map(exit.cause, (failure) => failure.cause))
        : undefined;
}

export async function runHarnessTurn(input: HarnessTurnInput): Promise<HarnessTurnResult> {
    input.turnTimings?.setReasoningEffort(input.reasoningEffort);
    const journal = await createComputerExecutionJournal({
        agentRoot: input.agentRoot,
        runId: input.runId,
    });
    const operation = Effect.tryPromise({
        catch: (cause) => new HarnessStreamForeignError({ cause }),
        try: async () => {
            const stored = await readAgentSessionState(input.agentRoot);
            const session = resolveTurnSession(stored, {
                generation: input.sessionGeneration,
                modelId: input.modelId,
                runtimeId: input.runtimeId,
            });
            const restartRequested = await isSessionRestartRequested(input.agentRoot);
            const lease = harnessSessionOwner(input.runtime).begin(input.agentRoot);
            let result: HarnessTurnResult;
            try {
                result = await executeHarnessTurn(input, session, restartRequested, journal, lease);
            } catch (error) {
                if (!(lease.stopping && input.signal?.aborted)) {
                    throw error;
                }
                result = {
                    aborted: true,
                    claudePlanUsage: null,
                    contextTokens: null,
                    tokenUsage: null,
                };
            } finally {
                lease.finish();
            }
            if (restartRequested && !result.aborted) {
                await clearSessionRestartRequest(input.agentRoot);
            }
            return result;
        },
    }).pipe(
        Effect.onExit((exit) =>
            Effect.tryPromise({
                catch: (cause) => new HarnessStreamForeignError({ cause }),
                try: () => journal.finish(journalOutcome(exit, input.signal), journalError(exit)),
            }).pipe(Effect.orDie)
        )
    );
    return settle(input.runtime, operation, {
        mapFailure: (failure) => failure.cause,
    });
}

async function executeHarnessTurn(
    input: HarnessTurnInput,
    session: AgentSessionState,
    restartRequested: boolean,
    journal: ComputerExecutionJournal,
    lease: HarnessSessionLease
): Promise<HarnessTurnResult> {
    const timings = input.turnTimings ?? new AgentTurnTimings();
    // For the prompt's activation hints; runtimes read the library natively.
    const skills = await readAgentSkills(input.skillsDir);
    // A changed managed-instruction fingerprint restarts the adapter, preserving conversation.
    // The turn input carries every Agent fact the prompt reads; only the workspace is renamed.
    const { fingerprint: instructionFingerprint, instructions } = composeAgentInstructions({
        ...input,
        workspacePath: input.workspaceDir,
    });
    const harness = createHarnessForRuntime(
        input.runtimeId,
        input.reasoningEffort,
        input.webAccess !== null,
        bridgeStoreDirForHost(),
        input.modelId
    );
    const bootstrapFingerprint = await fingerprintHarnessBootstrap({
        abortSignal: input.signal,
        harness,
    });
    const collectClaudePlanUsage =
        input.runtimeId === 'claude-code' && (await claimClaudeSdkUsageRefresh(input.dataRoot));
    const effectiveInput = collectClaudePlanUsage
        ? {
              ...input,
              env: { ...input.env, HAUS_CLAUDE_USAGE_REFRESH: '1' },
          }
        : input;
    const agent = (effectiveInput.harnessAgentFactory ?? harnessAgentFactory)(effectiveInput, {
        harness,
        instructions,
    });
    let live: HarnessAgentSession | undefined;
    const instructionActivityKey = 'instructions';
    const hausAgentVersionDrift = session.hausAgentVersion !== hausAgentVersion;
    try {
        const sessionId = session.runtimeSessionId ?? `${input.agentId}-${session.generation}`;
        const resumeFrom =
            (session.resumeState as HarnessAgentResumeSessionState | null) ?? undefined;
        lease.prepare(resumeFrom, (state, abortSignal) =>
            agent.createSession({ abortSignal, resumeFrom: state, sessionId })
        );
        const coveGuidance = await prepareCoveGuidanceForTurn({
            activity: input.activity,
            activityKey: instructionActivityKey,
            agentRoot: input.agentRoot,
            factoryKind: input.factoryKind,
            workspaceDir: input.workspaceDir,
        });
        // Remove only an unresumable cold generation; successful sessions retain resume state.
        if (!(resumeFrom || session.runtimeSessionId)) {
            await rm(join(input.agentRoot, '.agent-runs', sessionId), {
                force: true,
                recursive: true,
            });
        }
        const instructionDrift = session.instructionFingerprint !== instructionFingerprint;
        const bootstrapDrift = session.bootstrapFingerprint !== bootstrapFingerprint;
        const refreshBootstrap = resumeFrom !== undefined && (restartRequested || bootstrapDrift);
        if (
            resumeFrom &&
            (restartRequested ||
                instructionDrift ||
                bootstrapDrift ||
                (hausAgentVersionDrift && coveGuidance.versionCanApply)) &&
            !input.activity.isActive(instructionActivityKey)
        ) {
            await input.activity.start({
                category: 'updating_instructions',
                key: instructionActivityKey,
            });
        }
        const reasoningChanged = session.effectiveReasoningEffort !== input.reasoningEffort;
        const phase = createTurnPhaseLog(input);
        live = await startHarnessSession({
            agent,
            agentId: input.agentId,
            lease,
            phase,
            refreshBootstrap: refreshBootstrap
                ? (abortSignal) =>
                      timings.measure('bootstrap', () =>
                          harnessBootstrapRefresh({
                              abortSignal,
                              harness,
                              provider: createLocalTrustedSandboxProvider(sandboxOptions(input)),
                              sessionId,
                              workDir: basename(input.workspaceDir),
                          })
                      )
                : undefined,
            restartNative: refreshBootstrap || reasoningChanged,
            resumeFrom,
            runtime: input.runtime,
            sessionId,
            signal: input.signal,
            timings,
        });
        await phase('session ready');
        if (lease.stopping) {
            await writeAgentSessionState(input.agentRoot, {
                ...session,
                resumeState: await lease.checkpoint(),
                runtimeSessionId: live.sessionId,
            });
            return { aborted: true, claudePlanUsage: null, contextTokens: null, tokenUsage: null };
        }
        const prompt = composeTurnPrompt(input, resumedTurnSession(session, live.isResume));
        // A notice-lane drain is composed here, not served by the Server, so the Computer attests
        // it exactly as a pull does — to the Server before the model streams — and clears it from
        // the local notice projection before any stored notice can repeat it.
        await attestComposedDrain(input, prompt.drained);
        const turnContent = prompt.turnContent;
        const memoryNotice = await takeMemorySizeNotice(input);
        // Cleared only after a completed turn, so a turn that fails before the model sees it retries.
        const skillNotice = await readManagedSkillChangeNotice(input.agentRoot);
        // The no-progress deadline interrupts through the same path as Stop, keeping resume state.
        const noProgress = new AbortController();
        const turnSignal = AbortSignal.any([noProgress.signal, input.signal ?? noProgress.signal]);
        const turn = await agent.stream({
            abortSignal: turnSignal,
            prompt: projectMessageForAgent({
                content: [coveGuidance.notice, turnContent, memoryNotice, skillNotice?.text]
                    .filter(Boolean)
                    .join('\n\n'),
                enabledSkillIds: skills.map((skill) => skill.name),
            }),
            session: live,
        });
        const primaryNotice = prompt.notice;
        const deliverNotice = createNoticeDelivery(live, input, primaryNotice);
        const noticeCoordinator = createNoticeCoordinator(deliverNotice);
        const deliverAtSafeBoundary = async (notice: string) =>
            notice === primaryNotice
                ? await deliverNotice(notice)
                : await noticeCoordinator.enqueue(notice);
        const unregisterNoticeSink = input.registerNoticeSink?.(deliverAtSafeBoundary);
        const storedNoticeReady = Promise.withResolvers<void>();
        const storedNoticeDelivery = deliverStoredNotice(
            input.agentRoot,
            deliverAtSafeBoundary,
            input.onStoredNoticeDelivered,
            () => storedNoticeReady.resolve()
        );
        let observation: HarnessTurnResult;
        // The turn input carries the projector's activity run, thoughts, runtime, and workspace.
        const projector = createHarnessActivityProjector({ ...input, journal });
        try {
            observation = await settle(
                input.runtime,
                input.activity.around(
                    Effect.tryPromise({
                        catch: (cause) => new HarnessStreamForeignError({ cause }),
                        try: async () => {
                            await storedNoticeReady.promise;
                            return await observeTurnStream(
                                turn.fullStream,
                                noticeCoordinator,
                                projector,
                                {
                                    onFirstPart: () => {
                                        input.turnTimings?.mark('first_stream');
                                        return phase('first stream event');
                                    },
                                    onNoProgress: () => noProgress.abort(),
                                    onToolCall: () => input.turnTimings?.mark('first_tool'),
                                    runtime: input.runtime,
                                    signal: turnSignal,
                                    stallLabel: `${input.runtimeId} agent=${input.agentId}`,
                                }
                            );
                        },
                    }),
                    {
                        category: 'thinking',
                        key: 'thinking',
                        outcomeFromResult: (result) =>
                            result.aborted ? 'interrupted' : 'completed',
                    }
                ),
                { mapFailure: (failure) => failure.cause }
            );
            if (observation.claudePlanUsage) {
                await saveClaudePlanUsageSnapshot(
                    input.dataRoot,
                    observation.claudePlanUsage
                ).catch(() => undefined);
            }
        } catch (error) {
            await projector.finish(input.signal?.aborted ? 'interrupted' : 'failed', error);
            // Claude and Pi only discover a missing session or rejected replay once prompted.
            throw live.isResume && isPromptResumeRejection(error)
                ? new AgentSessionResumeRejectedError(input.agentId, { cause: error })
                : error;
        } finally {
            unregisterNoticeSink?.();
            noticeCoordinator.close();
            await storedNoticeDelivery;
        }
        if (observation.aborted || lease.stopping) {
            // Stop, the no-progress deadline, and shutdown all park at the SDK's idle boundary.
            await settleStoppedTurn(turn, input.runtimeId);
        }
        const resumeState = await lease.checkpoint();
        observation = { ...observation, aborted: observation.aborted || lease.stopping };
        if (observation.aborted) {
            await writeAgentSessionState(input.agentRoot, {
                ...session,
                effectiveReasoningEffort: input.reasoningEffort,
                hausAgentStatus: hausAgentVersionDrift ? 'failed' : session.hausAgentStatus,
                interruptedTurn: true,
                resumeState: resumeState as Record<string, unknown>,
                runtimeSessionId: live.sessionId,
            });
            await input.activity.finish(instructionActivityKey, 'interrupted');
            return { ...observation, stalled: noProgress.signal.aborted && !input.signal?.aborted };
        }
        const appliesHausAgentVersion = !hausAgentVersionDrift || coveGuidance.versionCanApply;
        await writeAgentSessionState(input.agentRoot, {
            bootstrapFingerprint,
            effectiveModel: { modelId: input.modelId, runtimeId: input.runtimeId },
            effectiveReasoningEffort: input.reasoningEffort,
            generation: session.generation,
            hausAgentAppliedAt:
                hausAgentVersionDrift && appliesHausAgentVersion
                    ? new Date().toISOString()
                    : session.hausAgentAppliedAt,
            hausAgentStatus: appliesHausAgentVersion ? 'current' : 'failed',
            hausAgentVersion: appliesHausAgentVersion ? hausAgentVersion : session.hausAgentVersion,
            instructionFingerprint,
            resumeState: resumeState as Record<string, unknown>,
            runtimeSessionId: live.sessionId,
        });
        if (coveGuidance.refreshPending && coveGuidance.refreshCanComplete) {
            await clearPendingCoveGuidanceRefresh(input.agentRoot);
        }
        if (skillNotice) {
            await clearManagedSkillChangeNotice(input.agentRoot, skillNotice);
        }
        await input.activity.finish(instructionActivityKey, 'completed');
        return observation;
    } catch (error) {
        await input.activity.finish(
            instructionActivityKey,
            input.signal?.aborted ? 'interrupted' : 'failed'
        );
        if (live || !lease.stopping) {
            lease.discard();
        }
        await live?.destroy().catch(() => undefined);
        await writeFailedTurnSession(input.agentRoot, session, {
            bridgeDestroyed: live !== undefined,
            versionFailed: hausAgentVersionDrift,
        });
        throw error;
    }
}

// Tests inject a fake Agent at this construction seam.
export type HarnessAgentFactory = (
    input: HarnessTurnInput,
    options: { harness: HarnessV1<ToolSet>; instructions: string }
) => Pick<HarnessAgent, 'createSession' | 'stream'>;

let harnessAgentFactory: HarnessAgentFactory = createHarnessAgent;

export function setHarnessAgentFactoryForTesting(factory: HarnessAgentFactory) {
    const previous = harnessAgentFactory;
    harnessAgentFactory = factory;
    return () => {
        harnessAgentFactory = previous;
    };
}

type HarnessBootstrapRefresh = typeof refreshHarnessBootstrap;
let harnessBootstrapRefresh: HarnessBootstrapRefresh = refreshHarnessBootstrap;

export function setHarnessBootstrapRefreshForTesting(refresh: HarnessBootstrapRefresh) {
    const previous = harnessBootstrapRefresh;
    harnessBootstrapRefresh = refresh;
    return () => {
        harnessBootstrapRefresh = previous;
    };
}
