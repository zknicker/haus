import { expect, test } from 'bun:test';
import {
    AggregationTemporality,
    DataPointType,
    InMemoryMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { Deferred, Effect, Fiber, Layer, ManagedRuntime, TestClock, TestContext } from 'effect';
import { makeTelemetryLayer, withTelemetrySpan } from './telemetry.ts';

test('records virtual multi-minute operation duration in milliseconds', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const metricReader = new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: 60_000,
    });
    const runtime = ManagedRuntime.make(
        Layer.merge(
            TestContext.TestContext,
            makeTelemetryLayer({ metricReader, serviceName: 'haus-test' })
        )
    );

    try {
        const started = await runtime.runPromise(Deferred.make<void>());
        const fiber = runtime.runFork(
            Deferred.succeed(started, undefined).pipe(
                Effect.zipRight(Effect.sleep('5 minutes')),
                withTelemetrySpan('haus.agent.turn', {
                    'haus.operation': 'test.virtual-duration',
                })
            )
        );
        await runtime.runPromise(Deferred.await(started));
        const completion = runtime.runPromise(Fiber.join(fiber));
        await runtime.runPromise(TestClock.adjust('5 minutes'));
        await completion;
        await metricReader.forceFlush();

        const duration = exporter
            .getMetrics()
            .flatMap((resource) => resource.scopeMetrics)
            .flatMap((scope) => scope.metrics)
            .find((metric) => metric.descriptor.name === 'haus.operation.duration');
        if (!duration || duration.dataPointType !== DataPointType.HISTOGRAM) {
            throw new Error('Expected the operation duration histogram.');
        }
        const sample = duration.dataPoints.find(
            (point) => point.attributes.operation === 'test.virtual-duration'
        );
        expect(duration.descriptor.unit).toBe('ms');
        expect(sample?.value.min).toBe(300_000);
        expect(sample?.value.max).toBe(300_000);
        expect(sample?.value.sum).toBe(300_000);
    } finally {
        await runtime.dispose();
    }
});
