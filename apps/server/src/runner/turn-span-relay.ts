import type { RunnerTurnSpanFrame } from '@haus/api';
import { type EffectRuntime, relaySpan } from '@haus/effect';

export async function relayRunnerTurnSpan(
    runtime: EffectRuntime<never>,
    frame: RunnerTurnSpanFrame
) {
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
            'haus.run.id': frame.runId,
            'haus.runtime.id': frame.runtimeId,
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
        failed: frame.outcome === 'failed',
        name: 'haus.agent.turn',
        ...(frame.parentSpanId ? { parentSpanId: frame.parentSpanId } : {}),
        sampled: frame.sampled,
        spanId: frame.spanId,
        startedAtMs: frame.startedAtMs,
        traceId: frame.traceId,
    });
}
