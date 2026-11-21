import { randomBytes } from 'node:crypto';
import {
    type AgentStartCommand,
    type AgentTurnSummary,
    type RunnerTurnSpanFrame,
    runnerTurnSpanFrameSchema,
} from '@haus/api';

export interface TurnTrace {
    readonly parentSpanId?: string;
    readonly sampled: boolean;
    readonly spanId: string;
    readonly traceId: string;
    readonly traceparent: string;
}

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u;

export function openTurnTrace(parent: AgentStartCommand['traceContext']) {
    const match = parent ? traceparentPattern.exec(parent.traceparent) : null;
    const traceId = match?.[1] ?? randomBytes(16).toString('hex');
    const sampled = match ? (Number.parseInt(match[3] ?? '00', 16) & 1) === 1 : true;
    const spanId = randomBytes(8).toString('hex');
    const trace: TurnTrace = {
        ...(match?.[2] ? { parentSpanId: match[2] } : {}),
        sampled,
        spanId,
        traceId,
        traceparent: `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`,
    };
    return trace;
}

export function turnSpanFrame(
    trace: TurnTrace,
    start: Pick<AgentStartCommand, 'chatId'>,
    summary: AgentTurnSummary
) {
    const candidate: RunnerTurnSpanFrame = {
        agentId: summary.agentId,
        ...(start.chatId ? { chatId: start.chatId } : {}),
        endedAtMs: Date.parse(summary.endedAt),
        ...(summary.failureKind ? { failureKind: summary.failureKind } : {}),
        messageCount: summary.messageCount,
        modelId: summary.modelId,
        outcome: summary.status,
        outputProduced: summary.outputProduced,
        ...(trace.parentSpanId ? { parentSpanId: trace.parentSpanId } : {}),
        runId: summary.runId,
        runtimeId: summary.runtimeId,
        sampled: trace.sampled,
        spanId: trace.spanId,
        startedAtMs: Date.parse(summary.startedAt),
        tokenUsage: summary.tokenUsage,
        traceId: trace.traceId,
        type: 'runner-turn-span',
    };
    const parsed = runnerTurnSpanFrameSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
}
