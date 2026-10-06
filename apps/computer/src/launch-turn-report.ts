import type { AgentTurnActivitySummary } from '@haus/api';
import type { AgentTurnFrame } from './agent-commands.ts';
import type { RunAgentLaunchOptions } from './launch.ts';
import type { RuntimeFailureKind } from './runtime-failure.ts';

/** Composes and sends the compact turn summary for one settled launch. */
export function reportTurn(
    options: RunAgentLaunchOptions,
    input: {
        activity?: AgentTurnActivitySummary;
        messageCount: number;
        failureKind?: RuntimeFailureKind;
        startedAt: string;
        status: 'completed' | 'failed' | 'interrupted';
        summary: string;
        tokenUsage?: AgentTurnFrame['tokenUsage'];
        visibleMessages?: Array<{ chatId: string; id: string; sequence: number }>;
    }
): AgentTurnFrame {
    const frame: AgentTurnFrame = {
        activity: input.activity ?? { operations: [] },
        agentId: options.command.agentId,
        endedAt: new Date().toISOString(),
        ...(input.failureKind ? { failureKind: input.failureKind } : {}),
        messageCount: input.messageCount,
        modelId: options.command.modelId,
        outputProduced: input.messageCount > 0,
        runId: options.command.runId,
        runtimeId: options.command.runtimeId,
        startedAt: input.startedAt,
        status: input.status,
        summary: input.summary,
        tokenUsage: input.tokenUsage ?? null,
        type: 'turn',
        visibleMessages: input.visibleMessages ?? [],
    };
    options.sendFrame(frame);
    return frame;
}
