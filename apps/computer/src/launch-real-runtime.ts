import type { AgentActivityRun } from './agent-activity-run.ts';
import type { AgentStartCommand } from './agent-commands.ts';
import { readAppliedAgentConfiguration } from './agent-configuration.ts';
import type { AgentTurnTimings } from './agent-turn-timings.ts';
import type { createComputerTools } from './computer-tools.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { StoredNoticeReceipt } from './delivery.ts';
import type { AgentDrive } from './drive/agent-drive.ts';
import {
    type NoticeSinkRegistrar,
    runHarnessTurn,
    type TurnDriverFactory,
} from './harness/executor.ts';
import type { AgentThoughtNarrator } from './harness/thought-narrator.ts';
import { turnDeliveryOf } from './harness/turn-prompt.ts';
import { messageOf, writeTrace } from './launch-trace.ts';
import { reportHarnessTurnFailure, settledTurnOutcome } from './turn-failure-report.ts';
import type { visibilityReceipt } from './visibility-receipt.ts';

export interface RuntimeExecutionInput {
    activity: AgentActivityRun;
    agentEnv: Record<string, string>;
    command: AgentStartCommand;
    dataRoot: string;
    dirs: { home: string; runtime: string; workspace: string };
    drive: AgentDrive;
    onStoredNoticeDelivered?: (receipt: StoredNoticeReceipt) => void;
    registerNoticeSink?: NoticeSinkRegistrar;
    runtime: DaemonRuntime;
    serverId: string;
    signal?: AbortSignal;
    turnTimings?: AgentTurnTimings;
}

export async function runRealRuntime(
    input: RuntimeExecutionInput & {
        agentRoot: string;
        attestVisible: ReturnType<typeof visibilityReceipt>;
        runtimeDriverFactory?: TurnDriverFactory;
        thoughts?: AgentThoughtNarrator;
        tools: ReturnType<typeof createComputerTools>;
    }
) {
    const { command } = input;
    try {
        const turn = await runHarnessTurn({
            turnTimings: input.turnTimings,
            agentId: command.agentId,
            attestVisible: input.attestVisible,
            agentName: command.agentName,
            agentRoot: input.agentRoot,
            dataRoot: input.dataRoot,
            env: input.agentEnv,
            homeDir: input.dirs.home,
            homeTimezone: command.homeTimezone ?? 'UTC',
            runtimeDriverFactory: input.runtimeDriverFactory,
            initialRole: command.agentDescription ?? null,
            conversationStyle: command.agentConversationStyle ?? null,
            signatureEmoji: command.agentSignatureEmoji ?? null,
            modelId: command.modelId,
            reasoningEffort:
                (await readAppliedAgentConfiguration(input.agentRoot))?.reasoningEffort ?? 'medium',
            ...turnDeliveryOf(command),
            onStoredNoticeDelivered: input.onStoredNoticeDelivered,
            activity: input.activity,
            thoughts: input.thoughts,
            registerNoticeSink: input.registerNoticeSink,
            runtime: input.runtime,
            runId: command.runId,
            runtimeId: command.runtimeId,
            sessionGeneration: command.sessionGeneration,
            signal: input.signal,
            serverId: input.serverId,
            drive: input.drive,
            workspaceDir: input.dirs.workspace,
            tools: input.tools,
        });
        await writeTrace(input, 'Harness turn completed.\n');
        return settledTurnOutcome(turn);
    } catch (error) {
        await writeTrace(input, `Harness turn failed: ${messageOf(error)}\n`);
        return await reportHarnessTurnFailure(input.runtime, command, error, input.signal);
    }
}
