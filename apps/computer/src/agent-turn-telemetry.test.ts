import { expect, test } from 'bun:test';
import { makeTelemetryLayer, tracePromise } from '@haus/effect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Layer, ManagedRuntime } from 'effect';
import { traceAgentTurn } from './agent-turn-telemetry.ts';

test('continues the Server dispatch trace across the Computer turn boundary', async () => {
    const exporter = new InMemorySpanExporter();
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    try {
        const traceContext = await tracePromise(
            runtime,
            'haus.agent.dispatch',
            { 'haus.operation': 'agent.dispatch' },
            async (carrier) => carrier
        );
        await traceAgentTurn(
            runtime,
            {
                agentId: 'agt_test',
                chatId: 'cht_test',
                modelId: 'gpt-test',
                runId: 'run_test',
                runtimeId: 'fake',
                traceContext,
            },
            async (_carrier, timings) => {
                timings.setReasoningEffort('low');
                timings.mark('first_stream');
                return {
                    messageCount: 0,
                    outputProduced: false,
                    status: 'completed' as const,
                    tokenUsage: {
                        inputTokens: 10,
                        outputTokens: 4,
                        totalTokens: 14,
                        cacheReadTokens: 8,
                        cacheWriteTokens: 0,
                    },
                };
            }
        );

        const spans = exporter.getFinishedSpans();
        const dispatch = spans.find((span) => span.name === 'haus.agent.dispatch');
        const turn = spans.find((span) => span.name === 'haus.agent.turn');
        expect(turn?.spanContext().traceId).toBe(dispatch?.spanContext().traceId);
        expect(turn?.parentSpanContext?.spanId).toBe(dispatch?.spanContext().spanId);
        expect(turn?.attributes).toMatchObject({
            'haus.agent.id': 'agt_test',
            'haus.message.count': 0,
            'haus.operation': 'agent.turn',
            'haus.outcome': 'completed',
            'haus.output.produced': false,
            'haus.run.id': 'run_test',
            'haus.reasoning.effort': 'low',
            'haus.tokens.input': 10,
            'haus.tokens.output': 4,
            'haus.tokens.cache_read': 8,
            'haus.tokens.cache_write': 0,
            'haus.turn.first_stream_ms': expect.any(Number),
        });
    } finally {
        await runtime.dispose();
    }
});

test('maps completed, failed, and interrupted turn results without replacing them', async () => {
    const exporter = new InMemorySpanExporter();
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    const disabledRuntime = ManagedRuntime.make(Layer.empty);
    const completed = {
        messageCount: 1,
        outputProduced: true,
        status: 'completed' as const,
    };
    const failed = {
        failureKind: 'provider_auth',
        messageCount: 0,
        outputProduced: false,
        status: 'failed' as const,
    };
    const interrupted = {
        messageCount: 0,
        outputProduced: false,
        status: 'interrupted' as const,
    };
    const command = {
        agentId: 'agt_test',
        chatId: 'cht_test',
        modelId: 'gpt-test',
        runtimeId: 'fake',
    };
    try {
        await expect(
            traceAgentTurn(runtime, { ...command, runId: 'run_completed' }, async () => completed)
        ).resolves.toBe(completed);
        await expect(
            traceAgentTurn(runtime, { ...command, runId: 'run_failed' }, async () => failed)
        ).resolves.toBe(failed);
        await expect(
            traceAgentTurn(runtime, { ...command, runId: 'run_interrupted' }, async () =>
                Promise.resolve(interrupted)
            )
        ).resolves.toBe(interrupted);
        await expect(
            traceAgentTurn(
                disabledRuntime,
                { ...command, runId: 'run_disabled' },
                async () => interrupted
            )
        ).resolves.toBe(interrupted);

        const spansByRun = new Map(
            exporter
                .getFinishedSpans()
                .map((span) => [span.attributes['haus.run.id'], span] as const)
        );
        expect(spansByRun.get('run_completed')?.status.code).toBe(1);
        expect(spansByRun.get('run_failed')?.status.code).toBe(2);
        expect(spansByRun.get('run_interrupted')?.status.code).toBe(1);
        expect(spansByRun.get('run_failed')?.attributes).toMatchObject({
            'haus.failure.kind': 'provider_auth',
            'haus.outcome': 'failed',
        });
        expect(spansByRun.get('run_interrupted')?.attributes['haus.outcome']).toBe('interrupted');
    } finally {
        await Promise.all([runtime.dispose(), disabledRuntime.dispose()]);
    }
});
