import { expect, test } from 'bun:test';
import { makeTelemetryLayer, tracePromise } from '@haus/effect';
import {
    AggregationTemporality,
    InMemoryMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Layer, ManagedRuntime, TestClock, TestContext } from 'effect';
import { startDeliveryRetrySweep } from './agent-delivery/retry-sweep.ts';
import { createReminderScheduler } from './reminders/reminder-scheduler.ts';

test('scheduler checks emit health metrics while real work keeps its operation span', async () => {
    const spans = new InMemorySpanExporter();
    const metrics = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter: metrics });
    const runtime = ManagedRuntime.make(
        Layer.merge(
            TestContext.TestContext,
            makeTelemetryLayer({
                metricReader: reader,
                serviceName: 'haus-test',
                spanProcessor: new SimpleSpanProcessor(spans),
            })
        )
    );
    let attempts = 0;
    const sweep = await startDeliveryRetrySweep(
        {
            async sweep() {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error('private database failure');
                }
                await tracePromise(runtime, 'haus.agent.dispatch', {}, async () => undefined);
            },
        },
        { runtime }
    );
    const reminders = await createReminderScheduler({
        clock: { now: () => new Date('2026-09-05T12:00:00Z') },
        runtime,
        tick: async () => ({ fired: 0 }),
    });
    try {
        await reminders.start();
        await runtime.runPromise(TestClock.adjust('4 seconds'));
        expect(attempts).toBe(2);
        expect(reminders.health().status).toBe('healthy');
        expect(spans.getFinishedSpans().map((span) => span.name)).toEqual(['haus.agent.dispatch']);
        await reader.forceFlush();
        const points = metrics
            .getMetrics()
            .flatMap((resource) => resource.scopeMetrics)
            .flatMap((scope) => scope.metrics)
            .filter((metric) => metric.descriptor.name === 'haus.operation.count')
            .flatMap((metric) => metric.dataPoints.map((point) => point.attributes));
        expect(points).toContainEqual({ operation: 'delivery.retry-sweep', outcome: 'failure' });
        expect(points).toContainEqual({ operation: 'delivery.retry-sweep', outcome: 'success' });
        expect(points).toContainEqual({ operation: 'reminder.tick', outcome: 'success' });
    } finally {
        await reminders.close();
        await sweep.close();
        await runtime.dispose();
    }
});
