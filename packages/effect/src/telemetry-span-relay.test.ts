import { expect, test } from 'bun:test';
import {
    AggregationTemporality,
    InMemoryMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Layer, ManagedRuntime } from 'effect';
import { makeLifecycleLoggerLayer } from './logging.ts';
import { type RelayedSpan, relaySpan } from './telemetry-span-relay.ts';
import { makeTelemetryLayer } from './telemetry.ts';

const turn: RelayedSpan = {
    attributes: { 'haus.agent.id': 'agt_1', 'haus.run.id': 'run_1' },
    endedAtMs: 1_763_640_001_250.5,
    name: 'haus.agent.turn',
    outcome: 'success',
    parentSpanId: 'b'.repeat(16),
    sampled: true,
    spanId: 'c'.repeat(16),
    startedAtMs: 1_763_640_000_000,
    traceId: 'a'.repeat(32),
};

test('a relayed span keeps its ids, parent and timing, and exports as the runner', async () => {
    const exporter = new InMemorySpanExporter();
    const runtime = ManagedRuntime.make(
        Layer.merge(
            makeLifecycleLoggerLayer(),
            makeTelemetryLayer({
                deploymentEnvironment: 'production',
                serviceName: 'haus-test',
                spanProcessor: new SimpleSpanProcessor(exporter),
            })
        )
    );
    try {
        await relaySpan(runtime, {
            ...turn,
            attributes: { ...turn.attributes, 'haus.secret': 'leak' } as RelayedSpan['attributes'],
        });
        await relaySpan(runtime, { ...turn, spanId: '0'.repeat(16) });
        await relaySpan(runtime, { ...turn, endedAtMs: turn.startedAtMs - 1 });

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        const [span] = spans;
        expect(span?.name).toBe('haus.agent.turn');
        expect(span?.spanContext()).toMatchObject({ spanId: turn.spanId, traceId: turn.traceId });
        expect(span?.parentSpanContext?.spanId).toBe(turn.parentSpanId);
        expect(span?.startTime).toEqual([1_763_640_000, 0]);
        expect(span?.endTime).toEqual([1_763_640_001, 250_500_000]);
        expect(span?.attributes).toEqual(turn.attributes);
        expect(span?.resource.attributes).toMatchObject({
            'deployment.environment.name': 'production',
            'haus.telemetry.source': 'haus-runner-relay',
            'service.name': 'haus-runner',
        });
    } finally {
        await runtime.dispose();
    }
});

test('a runtime without a trace exporter takes relayed spans as a no-op', async () => {
    const runtime = ManagedRuntime.make(makeTelemetryLayer({ serviceName: 'haus-test' }));
    try {
        expect(await relaySpan(runtime, turn)).toBeUndefined();
    } finally {
        await runtime.dispose();
    }
});

test('a relayed span counts in operation metrics even where no trace exporter runs', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({ metricReader: reader, serviceName: 'haus-test' })
    );
    const relayed: RelayedSpan = {
        ...turn,
        attributes: { 'haus.operation': 'test.relayed-turn' },
        outcome: 'failure',
    };
    try {
        await relaySpan(runtime, relayed);
        await relaySpan(runtime, { ...relayed, traceId: '0'.repeat(32) });
        await relaySpan(runtime, { ...relayed, endedAtMs: turn.startedAtMs - 1 });

        await reader.forceFlush();
        const metrics = exporter
            .getMetrics()
            .flatMap((resource) => resource.scopeMetrics)
            .flatMap((scope) => scope.metrics);
        const relayedPoints = (name: string) =>
            metrics
                .find((metric) => metric.descriptor.name === name)
                ?.dataPoints.filter((point) => point.attributes.operation === 'test.relayed-turn');
        expect(
            relayedPoints('haus.operation.count')?.map((point) => [point.attributes, point.value])
        ).toEqual([[{ operation: 'test.relayed-turn', outcome: 'failure' }, 1]]);
        expect(
            relayedPoints('haus.operation.duration')?.map((point) => [
                point.attributes,
                point.value,
            ])
        ).toEqual([
            [
                { operation: 'test.relayed-turn', outcome: 'failure', unit: 'ms' },
                expect.objectContaining({ count: 1, sum: 1250.5 }),
            ],
        ]);
    } finally {
        await runtime.dispose();
    }
});
