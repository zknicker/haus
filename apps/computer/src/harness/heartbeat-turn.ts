import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { settle } from '@haus/effect';
import { Effect } from 'effect';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import type { RuntimeSession } from '../runtime/driver.ts';
import { createHarnessActivityProjector } from './activity-projector.ts';
import { readAgentSkillNames } from './agent-skill-names.ts';
import type { ComputerExecutionJournal } from './execution-journal.ts';
import type { HarnessTurnInput, HarnessTurnResult } from './executor.ts';
import type { TurnDriverFactory } from './executor-seams.ts';
import { composeHeartbeatInput } from './heartbeat-prompt.ts';
import { composeAgentInstructions } from './instructions.ts';
import { projectMessageForAgent } from './rich-reference-projection.ts';
import { harnessSessionOwner } from './session-lifecycle.ts';
import { startHarnessSession } from './session-start.ts';
import { settleStoppedTurn } from './stopped-turn.ts';
import { createTurnPhaseLog } from './turn-phase-log.ts';
import { HarnessStreamForeignError, observeTurnStream } from './turn-stream.ts';

type HeartbeatTurnInput = HarnessTurnInput & {
    heartbeat: NonNullable<HarnessTurnInput['heartbeat']>;
};

/** The id of a heartbeat's own runtime session, never the Agent's main session id. */
export function heartbeatSessionId(agentId: string, runId: string): string {
    return `${agentId}-hb-${runId}`;
}

/**
 * Runs one heartbeat as a turn in a brand-new runtime session for the same Agent: same
 * instructions, identity, model, workspace, memory, and tools, but no resume state. It
 * never reads or writes `session.json`, never marks the main session interrupted, holds
 * a throwaway lease apart from the main one, parks under its own warm key so the main
 * session's warm process (and its background work) is untouched, takes no busy notice,
 * and destroys its session however the turn settles (specs/heartbeat.md, ADR 0049).
 */
export async function runHeartbeatTurn(
    input: HeartbeatTurnInput,
    createDriver: TurnDriverFactory,
    journal: ComputerExecutionJournal
): Promise<HarnessTurnResult> {
    const lease = harnessSessionOwner(input.runtime).beginThrowaway(input.agentRoot);
    const sessionId = heartbeatSessionId(input.agentId, input.runId);
    let live: RuntimeSession | undefined;
    try {
        const timings = input.turnTimings ?? new AgentTurnTimings();
        const skillNames = await readAgentSkillNames(input.skillsDir);
        const { instructions } = composeAgentInstructions({
            ...input,
            workspacePath: input.workspaceDir,
        });
        const driver = createDriver(input, {
            env: input.env,
            instructions,
            throwawayKey: `${input.agentRoot}#${sessionId}`,
        });
        const phase = createTurnPhaseLog(input);
        live = await startHarnessSession({
            agentId: input.agentId,
            driver,
            lease,
            phase,
            restartNative: false,
            resumeFrom: undefined,
            runtime: input.runtime,
            sessionId,
            signal: input.signal,
            timings,
        });
        await phase('session ready');
        if (lease.stopping) {
            return aborted();
        }
        const content = await composeHeartbeatInput(input.heartbeat, input.workspaceDir);
        const noProgress = new AbortController();
        const turnSignal = AbortSignal.any([noProgress.signal, input.signal ?? noProgress.signal]);
        const turn = await live.startTurn({
            prompt: projectMessageForAgent({ content, enabledSkillIds: skillNames }),
            signal: turnSignal,
        });
        const projector = createHarnessActivityProjector({ ...input, journal });
        let observation: HarnessTurnResult;
        try {
            observation = await settle(
                input.runtime,
                input.activity.around(
                    Effect.tryPromise({
                        catch: (cause) => new HarnessStreamForeignError({ cause }),
                        // No busy notice reaches a heartbeat, so no notice gate holds tool calls.
                        try: () =>
                            observeTurnStream(turn.events, undefined, projector, {
                                onFirstPart: () => {
                                    input.turnTimings?.mark('first_stream');
                                    return phase('first stream event');
                                },
                                onNoProgress: () => noProgress.abort(),
                                onToolCall: () => input.turnTimings?.mark('first_tool'),
                                runtime: input.runtime,
                                signal: turnSignal,
                                stallLabel: `${input.runtimeId} agent=${input.agentId} heartbeat`,
                            }),
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
        } catch (error) {
            await projector.finish(input.signal?.aborted ? 'interrupted' : 'failed', error);
            throw error;
        }
        const interrupted = observation.aborted || lease.stopping;
        if (interrupted) {
            await settleStoppedTurn(turn, input.runtimeId);
        }
        return {
            ...observation,
            aborted: interrupted,
            stalled: interrupted && noProgress.signal.aborted && !input.signal?.aborted,
        };
    } catch (error) {
        if (lease.stopping && input.signal?.aborted) {
            return aborted();
        }
        throw error;
    } finally {
        // Throwaway: the session and its run directory go away however the turn settled.
        lease.discard();
        await live?.destroy().catch(() => undefined);
        await rm(join(input.agentRoot, '.agent-runs', sessionId), { force: true, recursive: true });
        lease.finish();
    }
}

function aborted(): HarnessTurnResult {
    return { aborted: true, claudePlanUsage: null, contextTokens: null, tokenUsage: null };
}
