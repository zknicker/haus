import { type TraceCarrier, tracePromise } from '@haus/effect';
import { AgentTurnTimings } from './agent-turn-timings.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { HarnessTokenUsage } from './harness/token-usage.ts';
import type { AgentStartCommand } from './launch.ts';

export function parseTurnTraceContext(value: unknown): TraceCarrier | null {
    if (
        !(
            value &&
            typeof value === 'object' &&
            'traceparent' in value &&
            typeof value.traceparent === 'string'
        )
    ) {
        return null;
    }
    return /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u.test(value.traceparent)
        ? { traceparent: value.traceparent }
        : null;
}

export function traceAgentTurn<
    Result extends {
        readonly failureKind?: string;
        readonly messageCount: number;
        readonly outputProduced: boolean;
        readonly status: 'completed' | 'failed' | 'interrupted';
        readonly tokenUsage?: HarnessTokenUsage | null;
    },
>(
    runtime: DaemonRuntime,
    command: Pick<
        AgentStartCommand,
        'agentId' | 'chatId' | 'modelId' | 'runId' | 'runtimeId' | 'traceContext'
    >,
    operation: (traceContext: TraceCarrier, timings: AgentTurnTimings) => Promise<Result>
): Promise<Result> {
    const timings = new AgentTurnTimings();
    return tracePromise(
        runtime,
        'haus.agent.turn',
        {
            'haus.agent.id': command.agentId,
            ...(command.chatId ? { 'haus.chat.id': command.chatId } : {}),
            'haus.model.id': command.modelId,
            'haus.operation': 'agent.turn',
            'haus.run.id': command.runId,
            'haus.runtime.id': command.runtimeId,
        },
        (traceContext) => operation(traceContext, timings),
        command.traceContext,
        (result) => ({
            ...timings.snapshot(),
            ...(result.tokenUsage
                ? {
                      'haus.tokens.input': result.tokenUsage.inputTokens,
                      'haus.tokens.output': result.tokenUsage.outputTokens,
                      'haus.tokens.cache_read': result.tokenUsage.cacheReadTokens,
                      'haus.tokens.cache_write': result.tokenUsage.cacheWriteTokens,
                  }
                : {}),
            ...(result.failureKind ? { 'haus.failure.kind': result.failureKind } : {}),
            'haus.message.count': result.messageCount,
            'haus.outcome': result.status,
            'haus.output.produced': result.outputProduced,
        }),
        (result) => {
            switch (result.status) {
                case 'completed':
                    return 'success';
                case 'failed':
                    return 'failure';
                case 'interrupted':
                    return 'interruption';
            }
        }
    );
}
