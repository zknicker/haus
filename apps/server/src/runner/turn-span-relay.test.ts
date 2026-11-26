import { expect, test } from 'bun:test';
import {
    type RunnerTurnSpanFrame,
    runnerStartFrameSchema,
    runnerTurnSpanFrameSchema,
    runnerUpFrameSchema,
} from '@haus/api';
import { makeTelemetryLayer } from '@haus/effect';
import {
    AggregationTemporality,
    DataPointType,
    InMemoryMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Effect, ManagedRuntime } from 'effect';
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
        reasoningEffort: 'default',
        runId,
        runtimeId: 'claude-agent-sdk',
        serverId: 'srv_1',
        spanId: 'e'.repeat(16),
        startedAtMs: 1_763_640_000_000,
        timings: {},
        tokenUsage: null,
        type: 'runner-turn-span',
        ...overrides,
    };
    return frame;
}

function relayHarness() {
    const exporter = new InMemorySpanExporter();
    const metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({
        exporter: metrics,
        exportIntervalMillis: 60_000,
    });
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            metricReader: reader,
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    const clock = { now: 0 };
    const traces = new DispatchedTurnTraces(() => clock.now);
    traces.record(runnerStart('run_1', dispatchA));
    traces.record(runnerStart('run_2', dispatchB));
    const turnMetrics = async () => {
        await runtime.runPromise(Effect.void);
        await reader.forceFlush();
        const latest = metrics.getMetrics().at(-1);
        const found = (name: string) =>
            latest?.scopeMetrics
                .flatMap((scope) => scope.metrics)
                .find((metric) => metric.descriptor.name === name);
        const count = found('haus.operation.count');
        const duration = found('haus.operation.duration');
        const turnPoints = <Point extends { attributes: Record<string, unknown> }>(
            points: Point[]
        ) => points.filter((point) => point.attributes.operation === 'agent.turn');
        return {
            counts: turnPoints(
                count?.dataPointType === DataPointType.SUM ? count.dataPoints : []
            ).map((point) => ({
                attributes: point.attributes,
                value: point.value,
            })),
            durations: turnPoints(
                duration?.dataPointType === DataPointType.HISTOGRAM ? duration.dataPoints : []
            ).map((point) => ({
                attributes: point.attributes,
                count: point.value.count,
                sum: point.value.sum,
            })),
            unit: duration?.descriptor.unit,
        };
    };
    return { clock, exporter, runtime, traces, turnMetrics };
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

test('a relayed turn counts once in haus.operation.* as agent.turn with its outcome', async () => {
    const { runtime, traces, turnMetrics } = relayHarness();
    traces.record(runnerStart('run_3', dispatchA));
    try {
        const before = await turnMetrics();
        const failed = span('run_1', { failureKind: 'timeout', outcome: 'failed' });
        const interrupted = span('run_2', { endedAtMs: 1_763_640_000_250, outcome: 'interrupted' });
        expect(await relayRunnerTurnSpan(runtime, traces, failed)).toBe(true);
        expect(await relayRunnerTurnSpan(runtime, traces, interrupted)).toBe(true);
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_3'))).toBe(true);
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_3'))).toBe(false);
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_unknown'))).toBe(false);
        const after = await turnMetrics();

        expect(after.unit).toBe('ms');
        expect(after.counts.map((point) => point.attributes)).toEqual(
            expect.arrayContaining([
                { operation: 'agent.turn', outcome: 'failure' },
                { operation: 'agent.turn', outcome: 'interruption' },
                { operation: 'agent.turn', outcome: 'success' },
            ])
        );
        expect(after.durations.map((point) => point.attributes)).toEqual(
            expect.arrayContaining([
                { operation: 'agent.turn', outcome: 'failure', unit: 'ms' },
                { operation: 'agent.turn', outcome: 'interruption', unit: 'ms' },
                { operation: 'agent.turn', outcome: 'success', unit: 'ms' },
            ])
        );
        const grown = (outcome: string) => {
            const at = (metrics: typeof before) => ({
                count: metrics.counts.find((point) => point.attributes.outcome === outcome)?.value,
                duration: metrics.durations.find((point) => point.attributes.outcome === outcome),
            });
            const [then, now] = [at(before), at(after)];
            return {
                count: Number(now.count ?? 0) - Number(then.count ?? 0),
                durations: (now.duration?.count ?? 0) - (then.duration?.count ?? 0),
                durationSum: (now.duration?.sum ?? 0) - (then.duration?.sum ?? 0),
            };
        };
        expect(grown('failure')).toEqual({ count: 1, durationSum: 1000, durations: 1 });
        expect(grown('interruption')).toEqual({ count: 1, durationSum: 250, durations: 1 });
        expect(grown('success')).toEqual({ count: 1, durationSum: 1000, durations: 1 });
    } finally {
        await runtime.dispose();
    }
});

test('turn timings and reasoning arrive on the exported span, and out-of-bound timings are refused', async () => {
    const { exporter, runtime, traces } = relayHarness();
    const timings = {
        afterLastSendMs: 90,
        doneChats: 1,
        firstSendMs: 600,
        firstStreamMs: 300,
        firstToolMs: 450,
        harnessReadyMs: 120,
        lastSendMs: 910,
        sentChats: 1,
        sessionCreateMs: 80,
        slotWaitMs: 70,
    };
    try {
        for (const refused of [
            { firstStreamMs: 7 * 24 * 60 * 60 * 1000 + 1 },
            { firstStreamMs: 12.5 },
            { firstStreamMs: -1 },
            { doneChats: 2, sentChats: 1 },
            { prompt: 'private-prompt' },
        ]) {
            expect(
                runnerUpFrameSchema.safeParse({ ...span('run_1'), timings: refused }).success
            ).toBe(false);
        }
        expect(
            runnerUpFrameSchema.safeParse({ ...span('run_1'), reasoningEffort: 'turbo' }).success
        ).toBe(false);

        const frame = runnerTurnSpanFrameSchema.parse(
            span('run_1', { reasoningEffort: 'high', timings })
        );
        expect(await relayRunnerTurnSpan(runtime, traces, frame)).toBe(true);
        expect(await relayRunnerTurnSpan(runtime, traces, span('run_2'))).toBe(true);

        const [timed, untimed] = exporter.getFinishedSpans();
        expect(timed?.attributes).toEqual({
            'haus.agent.id': 'agt_1',
            'haus.message.count': 0,
            'haus.model.id': 'grok-faux',
            'haus.operation': 'agent.turn',
            'haus.outcome': 'completed',
            'haus.output.produced': false,
            'haus.reasoning.effort': 'high',
            'haus.run.id': 'run_1',
            'haus.runtime.id': 'claude-agent-sdk',
            'haus.turn.after_last_send_ms': 90,
            'haus.turn.done_chats': 1,
            'haus.turn.first_send_ms': 600,
            'haus.turn.first_stream_ms': 300,
            'haus.turn.first_tool_ms': 450,
            'haus.turn.harness_ready_ms': 120,
            'haus.turn.last_send_ms': 910,
            'haus.turn.sent_chats': 1,
            'haus.turn.session_create_ms': 80,
            'haus.turn.slot_wait_ms': 70,
        });
        expect(
            Object.keys(untimed?.attributes ?? {}).filter((key) => key.startsWith('haus.turn.'))
        ).toEqual([]);
    } finally {
        await runtime.dispose();
    }
});
