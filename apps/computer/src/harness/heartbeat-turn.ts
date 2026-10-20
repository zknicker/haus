import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { settle } from '@haus/effect';
import { Effect } from 'effect';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import { createHarnessActivityProjector } from './activity-projector.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import type { ComputerExecutionJournal } from './execution-journal.ts';
import type { HarnessAgentFactory, HarnessTurnInput, HarnessTurnResult } from './executor.ts';
import { composeHeartbeatInput } from './heartbeat-prompt.ts';
import { composeAgentInstructions } from './instructions.ts';
import { projectMessageForAgent } from './rich-reference-projection.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { harnessSessionOwner } from './session-lifecycle.ts';
import { startHarnessSession } from './session-start.ts';
import { readAgentSkills } from './skills.ts';
import { settleStoppedTurn } from './stopped-turn.ts';
import { createNoticeCoordinator } from './stored-notice.ts';
import { createTurnPhaseLog } from './turn-phase-log.ts';
import { HarnessStreamForeignError, observeTurnStream } from './turn-stream.ts';

type HeartbeatTurnInput = HarnessTurnInput & {
    heartbeat: NonNullable<HarnessTurnInput['heartbeat']>;
};

/** The id of a heartbeat's own harness session, never the Agent's main session id. */
export function heartbeatSessionId(agentId: string, runId: string): string {
    return `${agentId}-hb-${runId}`;
}

/**
 * Runs one heartbeat as a turn in a brand-new harness session for the same Agent: same
 * instructions, identity, model, workspace, memory, and tools, but no resume state. It
 * never reads or writes `session.json`, never marks the main session interrupted, holds
 * a throwaway lease apart from the main one, registers no busy-notice sink, and destroys
 * its session however the turn settles (specs/heartbeat.md, ADR 0049).
 */
export async function runHeartbeatTurn(
    input: HeartbeatTurnInput,
    createAgent: HarnessAgentFactory,
    journal: ComputerExecutionJournal
): Promise<HarnessTurnResult> {
    const lease = harnessSessionOwner(input.runtime).beginThrowaway(input.agentRoot);
    const sessionId = heartbeatSessionId(input.agentId, input.runId);
    let live: HarnessAgentSession | undefined;
    try {
        const timings = input.turnTimings ?? new AgentTurnTimings();
        const skills = await readAgentSkills(input.skillsDir);
        const { instructions } = composeAgentInstructions({
            ...input,
            workspacePath: input.workspaceDir,
        });
        const harness = createHarnessForRuntime(
            input.runtimeId,
            input.reasoningEffort,
            bridgeStoreDirForHost(),
            input.modelId
        );
        const agent = createAgent(input, { harness, instructions });
        const phase = createTurnPhaseLog(input);
        live = await startHarnessSession({
            agent,
            agentId: input.agentId,
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
        const turn = await agent.stream({
            abortSignal: turnSignal,
            prompt: projectMessageForAgent({
                content,
                enabledSkillIds: skills.map((skill) => skill.name),
            }),
            session: live,
        });
        // No busy notice reaches a heartbeat: a coordinator that delivers nothing is only a tool gate.
        const gate = createNoticeCoordinator(async () => false);
        const projector = createHarnessActivityProjector({ ...input, journal });
        let observation: HarnessTurnResult;
        try {
            observation = await settle(
                input.runtime,
                input.activity.around(
                    Effect.tryPromise({
                        catch: (cause) => new HarnessStreamForeignError({ cause }),
                        try: () =>
                            observeTurnStream(turn.fullStream, gate, projector, {
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
        } finally {
            gate.close();
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
        // Throwaway: the session and its native run directory go away however the turn settled.
        await live?.destroy().catch(() => undefined);
        await rm(join(input.agentRoot, '.agent-runs', sessionId), { force: true, recursive: true });
        lease.finish();
    }
}

function aborted(): HarnessTurnResult {
    return { aborted: true, claudePlanUsage: null, contextTokens: null, tokenUsage: null };
}
