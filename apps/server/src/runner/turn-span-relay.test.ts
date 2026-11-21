import { expect, test } from 'bun:test';
import { type RunnerTurnSpanFrame, runnerStartFrameSchema, runnerUpFrameSchema } from '@haus/api';
import { makeTelemetryLayer } from '@haus/effect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import { DispatchedTurnTraces } from './dispatched-turn-traces.ts';
import { relayRunnerTurnSpan } from './turn-span-relay.ts';

const dispatchA = { spanId: 'b'.repeat(16), traceId: 'a'.repeat(32) };
const dispatchB = { spanId: 'd'.repeat(16), traceId: 'c'.repeat(32) };

function runnerStart(runId: string, dispatch: { spanId: string; traceId: string }) {
    return runnerStartFrameSchema.parse({
        modelConnectionId: null,
        runCredential: `grtr_${'a'.repeat(43)}`,
        serverId: 'srv_1',
        sessionResetKind: 'session',
        start: {
            agentId: 'agt_1',
            agentName: 'blippy',
            chatId: 'chat_1',
            drainItemIds: [],
            inboxDelivery: 'notice',
            modelId: 'grok-faux',
            runId,
            runtimeId: 'claude-agent-sdk',
            sessionGeneration: 1,
            totalPending: 0,
            traceContext: { traceparent: `00-${dispatch.traceId}-${dispatch.spanId}-01` },
            type: 'start',
            warmDrainItemIds: [],
        },
        type: 'runner-start',
    });
}

function span(runId: string, overrides: Partial<RunnerTurnSpanFrame> = {}) {
    const frame: RunnerTurnSpanFrame = {
        agentId: 'agt_1',
        endedAtMs: 1_763_640_001_000,
        messageCount: 0,
        modelId: 'grok-faux',
        outcome: 'completed',
        outputProduced: false,
        runId,
        runtimeId: 'claude-agent-sdk',
        serverId: 'srv_1',
        spanId: 'e'.repeat(16),
        startedAtMs: 1_763_640_000_000,
        tokenUsage: null,
        type: 'runner-turn-span',
        ...overrides,
    };
    return frame;
}

function relayHarness() {
    const exporter = new InMemorySpanExporter();
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    const clock = { now: 0 };
    const traces = new DispatchedTurnTraces(() => clock.now);
    traces.record(runnerStart('run_1', dispatchA));
    traces.record(runnerStart('run_2', dispatchB));
    return { clock, exporter, runtime, traces };
}

test('a turn span is stamped with its own run’s dispatch trace, never one the runner names', async () => {
    const { exporter, runtime, traces } = relayHarness();
    try {
        expect(
            runnerUpFrameSchema.safeParse({
                ...span('run_1'),
                parentSpanId: dispatchB.spanId,
                traceId: dispatchB.traceId,
            }).success
        ).toBe(false);

        expect(await relayRunnerTurnSpan(runtime, traces, span('run_1'))).toBe(true);

        const [exported] = exporter.getFinishedSpans();
        expect(exporter.getFinishedSpans()).toHaveLength(1);
        expect(exported?.spanContext()).toMatchObject({
            spanId: 'e'.repeat(16),
            traceId: dispatchA.traceId,
        });
        expect(exported?.parentSpanContext?.spanId).toBe(dispatchA.spanId);
    } finally {
        await runtime.dispose();
    }
});

test('a span for an unknown, foreign, replayed or expired run is dropped', async () => {
    const { clock, exporter, runtime, traces } = relayHarness();
    try {
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_unknown'))).toBe(false);
        expect(
            await relayRunnerTurnSpan(runtime, traces, span('run_2', { agentId: 'agt_other' }))
        ).toBe(false);
        expect(
            await relayRunnerTurnSpan(runtime, traces, span('run_2', { serverId: 'srv_other' }))
        ).toBe(false);
        expect(exporter.getFinishedSpans()).toHaveLength(0);

        expect(await relayRunnerTurnSpan(runtime, traces, span('run_2'))).toBe(true);
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_2'))).toBe(false);

        clock.now = 6 * 60 * 60 * 1000 + 1;
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_1'))).toBe(false);
        expect(
            exporter.getFinishedSpans().map((exported) => exported.spanContext().traceId)
        ).toEqual([dispatchB.traceId]);
    } finally {
        await runtime.dispose();
    }
});
