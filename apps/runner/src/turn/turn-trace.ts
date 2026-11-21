import { randomBytes } from 'node:crypto';
import {
    type AgentReasoningEffort,
    type AgentStartCommand,
    type AgentTurnSummary,
    type RunnerTurnSpanFrame,
    type RunnerTurnTimings,
    runnerTurnSpanFrameSchema,
} from '@haus/api';

export interface TurnTrace {
    readonly spanId: string;
    readonly traceparent: string;
}

const traceparentPattern = /^00-([0-9a-f]{32})-[0-9a-f]{16}-([0-9a-f]{2})$/u;

export function openTurnTrace(parent: AgentStartCommand['traceContext']) {
    const match = parent ? traceparentPattern.exec(parent.traceparent) : null;
    const traceId = match?.[1] ?? randomBytes(16).toString('hex');
    const sampled = match ? (Number.parseInt(match[2] ?? '00', 16) & 1) === 1 : true;
    const spanId = randomBytes(8).toString('hex');
    const trace: TurnTrace = {
        spanId,
        traceparent: `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`,
    };
    return trace;
}

export function turnSpanFrame(
    run: {
        readonly reasoningEffort: AgentReasoningEffort;
        readonly serverId: string;
        readonly start: Pick<AgentStartCommand, 'chatId'>;
        readonly trace: TurnTrace;
    },
    summary: AgentTurnSummary,
    timings: RunnerTurnTimings
) {
    const candidate: RunnerTurnSpanFrame = {
        agentId: summary.agentId,
        ...(run.start.chatId ? { chatId: run.start.chatId } : {}),
        endedAtMs: Date.parse(summary.endedAt),
        ...(summary.failureKind ? { failureKind: summary.failureKind } : {}),
        messageCount: summary.messageCount,
        modelId: summary.modelId,
        outcome: summary.status,
        outputProduced: summary.outputProduced,
        reasoningEffort: run.reasoningEffort,
        runId: summary.runId,
        runtimeId: summary.runtimeId,
        serverId: run.serverId,
        spanId: run.trace.spanId,
        startedAtMs: Date.parse(summary.startedAt),
        timings,
        tokenUsage: summary.tokenUsage,
        type: 'runner-turn-span',
    };
    const parsed = runnerTurnSpanFrameSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
}
