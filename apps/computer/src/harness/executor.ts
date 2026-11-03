import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type AgentReasoningEffort, hausAgentVersion } from '@haus/api';
import type { ClaudeUsageSnapshot } from '@haus/claude-usage';
import { settle } from '@haus/effect';
import { Effect } from 'effect';
import type { AgentActivityRun } from '../agent-activity-run.ts';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { StoredNoticeReceipt } from '../delivery.ts';
import { journalSinkFor } from '../execution-journal-upload/attachment-journal-uploads.ts';
import type { HostToolSet } from '../host-tools/host-tool.ts';
import {
    clearManagedSkillChangeNotice,
    readManagedSkillChangeNotice,
} from '../managed-skill-changes.ts';
import type { RuntimeSession } from '../runtime/driver.ts';
import { isRuntimeResumeRejection } from '../runtime/resume-rejected.ts';
import {
    claimClaudeSdkUsageRefresh,
    saveClaudePlanUsageSnapshot,
} from '../usage/claude-plan-usage-state.ts';
import { createHarnessActivityProjector } from './activity-projector.ts';
import { readAgentSkillNames } from './agent-skill-names.ts';
import { clearPendingCoveGuidanceRefresh } from './cove-guidance-refresh.ts';
import { prepareCoveGuidanceForTurn } from './cove-guidance-turn.ts';
import {
    type ComputerExecutionJournal,
    createComputerExecutionJournal,
} from './execution-journal.ts';
import { currentRuntimeDriverFactory, type TurnDriverFactory } from './executor-seams.ts';
import { clearQuietRunNote, quietRunLine, readQuietRunNote } from './heartbeat-note.ts';
import { runHeartbeatTurn } from './heartbeat-turn.ts';
import { composeAgentInstructions } from './instructions.ts';
import { journalError, journalOutcome } from './journal-outcome.ts';
import { AgentSessionResumeRejectedError } from './resume-rejection.ts';
import { projectMessageForAgent } from './rich-reference-projection.ts';
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
import { settleStoppedTurn } from './stopped-turn.ts';
import type { HarnessTokenUsage } from './token-usage.ts';
import { openTurnNotices, returnUnconsumedNotices } from './turn-notices.ts';
import { createTurnPhaseLog } from './turn-phase-log.ts';
import { attestComposedDrain, composeTurnPrompt, type TurnDelivery } from './turn-prompt.ts';
import { HarnessStreamForeignError, observeTurnStream } from './turn-stream.ts';

/** Drives one isolated, persistent Codex, Claude Code, or Grok Build Agent session. */
export interface HarnessTurnInput extends TurnDelivery {
    activity: AgentActivityRun;
    agentName: string;
    agentRoot: string;
    conversationStyle?: string | null;
    env: Record<string, string>;
    factoryKind: 'cove' | 'ordinary';
    homeDir: string;
    initialRole: string | null;
    modelId: string;
    onStoredNoticeDelivered?: (receipt: StoredNoticeReceipt) => void;
    reasoningEffort: AgentReasoningEffort;
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    /** Per-turn construction seam for boundary tests; production uses the default driver. */
    runtimeDriverFactory?: TurnDriverFactory;
    runtimeId: string;
    sessionGeneration: number;
    signal?: AbortSignal;
    signatureEmoji?: string | null;
    skillsDir: string;
    thoughts?: import('./thought-narrator.ts').AgentThoughtNarrator;
    tools: HostToolSet;
    turnTimings?: AgentTurnTimings;
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

export { setRuntimeDriverFactoryForTesting, type TurnDriverFactory } from './executor-seams.ts';
export type { HarnessTokenUsage } from './token-usage.ts';
export { HarnessTurnFailedError } from './turn-stream.ts';

export async function runHarnessTurn(input: HarnessTurnInput): Promise<HarnessTurnResult> {
    input.turnTimings?.setReasoningEffort(input.reasoningEffort);
    const journal = await createComputerExecutionJournal(input, await journalSinkFor(input));
    const operation = Effect.tryPromise({
        catch: (cause) => new HarnessStreamForeignError({ cause }),
        try: async () => {
            if (input.heartbeat) {
                // A heartbeat opens its own throwaway session; the main session is not read or written.
                return await runHeartbeatTurn(
                    { ...input, heartbeat: input.heartbeat },
                    input.runtimeDriverFactory ?? currentRuntimeDriverFactory(),
                    journal
                );
            }
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
    const skillNames = await readAgentSkillNames(input.skillsDir);
    // The turn input carries every Agent fact the prompt reads; only the workspace is renamed.
    const { fingerprint: instructionFingerprint, instructions } = composeAgentInstructions({
        ...input,
        workspacePath: input.workspaceDir,
    });
    const collectClaudePlanUsage =
        input.runtimeId === 'claude-code' && (await claimClaudeSdkUsageRefresh(input.dataRoot));
    const driver = (input.runtimeDriverFactory ?? currentRuntimeDriverFactory())(input, {
        env: collectClaudePlanUsage ? { ...input.env, HAUS_CLAUDE_USAGE_REFRESH: '1' } : input.env,
        instructions,
    });
    const bootstrapFingerprint = await driver.bootstrapFingerprint(input.signal);
    let live: RuntimeSession | undefined;
    const instructionActivityKey = 'instructions';
    const hausAgentVersionDrift = session.hausAgentVersion !== hausAgentVersion;
    try {
        const sessionId = session.runtimeSessionId ?? `${input.agentId}-${session.generation}`;
        const resumeFrom = session.resumeState ?? undefined;
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
            agentId: input.agentId,
            driver,
            lease,
            phase,
            refreshBootstrap: refreshBootstrap
                ? (signal) =>
                      timings.measure('bootstrap', () =>
                          driver.refreshBootstrap({ sessionId, signal })
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
        // Cleared only after a completed turn, so a turn that fails before the model sees it retries.
        const skillNotice = await readManagedSkillChangeNotice(input.agentRoot);
        // Any main-session turn hears what its heartbeats did; a report run clears it unrendered.
        const quietNote = await readQuietRunNote(input.agentRoot);
        const quietLine = quietNote && !input.heartbeatReport ? quietRunLine(quietNote) : null;
        // The no-progress deadline interrupts through the same path as Stop, keeping resume state.
        const noProgress = new AbortController();
        const turnSignal = AbortSignal.any([noProgress.signal, input.signal ?? noProgress.signal]);
        const turn = await live.startTurn({
            prompt: projectMessageForAgent({
                content: [quietLine, coveGuidance.notice, turnContent, skillNotice?.text]
                    .filter(Boolean)
                    .join('\n\n'),
                enabledSkillIds: skillNames,
            }),
            signal: turnSignal,
            wake: input.subagentWake !== undefined,
        });
        const notices = openTurnNotices(live, input, prompt.notice);
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
                            await notices.ready;
                            return await observeTurnStream(
                                turn.events,
                                notices.coordinator,
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
            await notices.returnUnconsumed(turn);
            // Claude Code only discovers a missing conversation once prompted.
            throw live.isResume && isRuntimeResumeRejection(error)
                ? new AgentSessionResumeRejectedError(input.agentId, { cause: error })
                : error;
        } finally {
            await notices.close();
        }
        if (observation.aborted || lease.stopping) {
            // Stop, the no-progress deadline, and shutdown all park at the runtime's idle boundary.
            await settleStoppedTurn(turn, input.runtimeId);
        }
        await returnUnconsumedNotices(turn, input);
        const resumeState = await lease.checkpoint();
        observation = { ...observation, aborted: observation.aborted || lease.stopping };
        if (observation.aborted) {
            await writeAgentSessionState(input.agentRoot, {
                ...session,
                effectiveReasoningEffort: input.reasoningEffort,
                hausAgentStatus: hausAgentVersionDrift ? 'failed' : session.hausAgentStatus,
                interruptedTurn: true,
                resumeState,
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
            resumeState,
            runtimeSessionId: live.sessionId,
        });
        if (coveGuidance.refreshPending && coveGuidance.refreshCanComplete) {
            await clearPendingCoveGuidanceRefresh(input.agentRoot);
        }
        if (skillNotice) {
            await clearManagedSkillChangeNotice(input.agentRoot, skillNotice);
        }
        if (quietNote) {
            await clearQuietRunNote(input.agentRoot);
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
            versionFailed: hausAgentVersionDrift,
        });
        throw error;
    }
}
