import { join } from 'node:path';
import { parseStopBackgroundCommand, parseStopCommand } from './agent-command-frames.ts';
import type { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { evictWarmRuntime } from './runtime/runtime-context.ts';

/**
 * A human Stop: `stop` kills the named run's turn; `agent-stop-background` then ends the
 * Agent's runtime process, and with it the background sub-agents and shells it left running
 * between turns, once any live turn has settled and parked it. Returns whether `frame` was one.
 */
export function handleStopFrame(
    frame: unknown,
    deps: {
        agentWork: Pick<AgentWorkCoordinator, 'abortRun' | 'waitForRun'>;
        agentsDir: string;
        onError(error: unknown): void;
        runtime: DaemonRuntime;
        track<Result>(operation: Promise<Result>): Promise<Result>;
    }
): boolean {
    const stop = parseStopCommand(frame);
    if (stop) {
        deps.agentWork.abortRun(stop.runId);
        return true;
    }
    const background = parseStopBackgroundCommand(frame);
    if (!background) {
        return false;
    }
    const agentRoot = join(deps.agentsDir, background.agentId);
    void deps
        .track(
            deps.agentWork
                .waitForRun(background.agentId)
                .then(() => evictWarmRuntime(deps.runtime, agentRoot))
        )
        .catch(deps.onError);
    return true;
}
