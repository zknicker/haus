import type { RunnerTurnSpanFrame } from '@haus/api';
import { type EffectRuntime, type RelayedSpan, relaySpan } from '@haus/effect';
import type { DispatchedTurnTraces } from './dispatched-turn-traces.ts';

export async function relayRunnerTurnSpan(
    runtime: EffectRuntime<never>,
    traces: DispatchedTurnTraces,
    frame: RunnerTurnSpanFrame
) {
    const dispatch = traces.claim(frame);
    if (!dispatch) {
        return false;
    }
    const usage = frame.tokenUsage;
    await relaySpan(runtime, {
        attributes: {
            'haus.agent.id': frame.agentId,
            ...(frame.chatId ? { 'haus.chat.id': frame.chatId } : {}),
            ...(frame.failureKind ? { 'haus.failure.kind': frame.failureKind } : {}),
            'haus.message.count': frame.messageCount,
            'haus.model.id': frame.modelId,
            'haus.operation': 'agent.turn',
            'haus.outcome': frame.outcome,
            'haus.output.produced': frame.outputProduced,
            'haus.reasoning.effort': frame.reasoningEffort,
            'haus.run.id': frame.runId,
            'haus.runtime.id': frame.runtimeId,
            ...turnTimingAttributes(frame.timings),
            ...(usage
                ? {
                      'haus.tokens.cache_read': usage.cacheReadTokens,
                      'haus.tokens.cache_write': usage.cacheWriteTokens,
                      'haus.tokens.input': usage.inputTokens,
                      'haus.tokens.output': usage.outputTokens,
                  }
                : {}),
        },
        endedAtMs: frame.endedAtMs,
        name: 'haus.agent.turn',
        outcome: operationOutcomes[frame.outcome],
        parentSpanId: dispatch.parentSpanId,
        sampled: dispatch.sampled,
        spanId: frame.spanId,
        startedAtMs: frame.startedAtMs,
        traceId: dispatch.traceId,
    });
    return true;
}

const operationOutcomes = {
    completed: 'success',
    failed: 'failure',
    interrupted: 'interruption',
} as const satisfies Record<RunnerTurnSpanFrame['outcome'], RelayedSpan['outcome']>;

function turnTimingAttributes(timings: RunnerTurnSpanFrame['timings']) {
    const attributes: RelayedSpan['attributes'] = {
        'haus.turn.after_last_send_ms': timings.afterLastSendMs,
        'haus.turn.done_chats': timings.doneChats,
        'haus.turn.first_send_ms': timings.firstSendMs,
        'haus.turn.first_stream_ms': timings.firstStreamMs,
        'haus.turn.first_tool_ms': timings.firstToolMs,
        'haus.turn.harness_ready_ms': timings.harnessReadyMs,
        'haus.turn.last_send_ms': timings.lastSendMs,
        'haus.turn.sent_chats': timings.sentChats,
        'haus.turn.session_create_ms': timings.sessionCreateMs,
    };
    return attributes;
}
