import type {
    HarnessAgent,
    HarnessAgentResumeSessionState,
    HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import type { AgentTurnTimings } from '../agent-turn-timings.ts';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { AgentSessionResumeRejectedError, isResumeRejection } from './resume-rejection.ts';
import type { HarnessSessionLease } from './session-lifecycle.ts';
import { harnessStartupDeadlineMs, runHarnessStart, type StartupWindow } from './start-gate.ts';

export interface HarnessSessionStart {
    agent: Pick<HarnessAgent, 'createSession'>;
    agentId: string;
    deadlineMs?: number;
    lease: HarnessSessionLease;
    phase: (label: string) => Promise<void>;
    /** Runs after parking, before the live session resumes the parked state. */
    refreshBootstrap?: (signal: AbortSignal) => Promise<void>;
    /** Parks the stored session and restarts its native process before resuming. */
    restartNative: boolean;
    resumeFrom: HarnessAgentResumeSessionState | undefined;
    runtime: DaemonRuntime;
    sessionId: string;
    signal?: AbortSignal;
    timings: AgentTurnTimings;
}

/**
 * Creates the turn's live session inside the machine-wide start gate and the startup deadline.
 * Only specific evidence that stored state is unusable becomes a resume rejection.
 */
export async function startHarnessSession(
    start: HarnessSessionStart
): Promise<HarnessAgentSession> {
    return await runHarnessStart(
        start.runtime,
        start.signal,
        start.deadlineMs ?? harnessStartupDeadlineMs,
        async (window) => {
            let resumeFrom = start.resumeFrom;
            if (resumeFrom && start.restartNative) {
                const parked = await createSession(start, resumeFrom, window);
                resumeFrom = await parked.stop();
                await start.refreshBootstrap?.(window.signal);
            }
            await start.phase(resumeFrom ? 'creating session (resume)' : 'creating session (cold)');
            start.timings.mark('harness_ready');
            const live = await start.timings
                .measure('session_create', () => createSession(start, resumeFrom, window))
                .catch(async (error: unknown) => {
                    await start.phase('session creation failed');
                    throw error;
                });
            start.lease.attach(live, (state, abortSignal) =>
                start.agent.createSession({
                    abortSignal,
                    resumeFrom: state,
                    sessionId: start.sessionId,
                })
            );
            return live;
        }
    );
}

async function createSession(
    start: HarnessSessionStart,
    resumeFrom: HarnessAgentResumeSessionState | undefined,
    window: StartupWindow
): Promise<HarnessAgentSession> {
    window.signal.throwIfAborted();
    let session: HarnessAgentSession;
    try {
        session = await start.agent.createSession({
            abortSignal: window.signal,
            resumeFrom,
            sessionId: start.sessionId,
        });
    } catch (error) {
        throw resumeFrom && isResumeRejection(error)
            ? new AgentSessionResumeRejectedError(start.agentId, { cause: error })
            : error;
    }
    if (window.abandoned()) {
        // The deadline or an abort already released the turn; nothing will own this session.
        await session.destroy().catch(() => undefined);
        throw window.signal.reason;
    }
    return session;
}
