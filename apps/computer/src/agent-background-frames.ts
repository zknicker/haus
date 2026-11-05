import { join } from 'node:path';
import { agentSubagentWakeResultSchema } from '@haus/api';
import { parseStopBackgroundCommand, parseStopCommand } from './agent-command-frames.ts';
import type { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import type { BackgroundWorkReporter } from './background-work-reporter.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { evictWarmRuntime } from './runtime/runtime-context.ts';
import { handleServerRuntimeSettingsFrame } from './server-runtime-settings-frame.ts';

/**
 * Server frames about an Agent's run and what its runtime does between turns. A human Stop:
 * `stop` kills the named run's turn; `agent-stop-background` then ends the Agent's runtime
 * process, and with it the background sub-agents and shells it left running between turns, once
 * any live turn has settled and parked it. `agent-subagent-wake-result` answers a wake request.
 * `server-runtime-settings` sets whether parked sessions compact while idle. Returns whether
 * `frame` was one.
 */
export function handleBackgroundFrame(
    frame: unknown,
    deps: {
        agentWork: Pick<AgentWorkCoordinator, 'abortRun' | 'waitForRun'>;
        agentsDir: string;
        backgroundWork?: Pick<BackgroundWorkReporter, 'onWakeResult'>;
        onError(error: unknown): void;
        runtime: DaemonRuntime;
        track<Result>(operation: Promise<Result>): Promise<Result>;
    }
): boolean {
    if (handleServerRuntimeSettingsFrame(frame, deps.runtime)) {
        return true;
    }
    const stop = parseStopCommand(frame);
    if (stop) {
        deps.agentWork.abortRun(stop.runId);
        return true;
    }
    const wakeResult = agentSubagentWakeResultSchema.safeParse(frame);
    if (wakeResult.success) {
        deps.backgroundWork?.onWakeResult(wakeResult.data);
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
