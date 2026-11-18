import { expect, test } from 'bun:test';
import {
    AggregationTemporality,
    DataPointType,
    InMemoryMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Cause, Effect, Exit, ManagedRuntime, Option } from 'effect';
import {
    makeProcessTelemetryLayer,
    makeTelemetryLayer,
    tracePromise,
    withTelemetrySpan,
} from './telemetry.ts';

test('reported outcomes drive exact span status and metric outcome without changing results', async () => {
    const spanExporter = new InMemorySpanExporter();
    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
    });
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            metricReader,
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(spanExporter),
        })
    );
    const disabledRuntime = ManagedRuntime.make(
        makeProcessTelemetryLayer({ environment: {}, serviceName: 'haus-test' })
    );
    const completed = { status: 'completed' as const };
    const failed = { status: 'failed' as const };
    const interrupted = { status: 'interrupted' as const };
    const unclassifiable = { status: 'completed' as const };
    let throwingOutcomeCalls = 0;
    const outcomeFromResult = (result: typeof completed | typeof failed | typeof interrupted) => {
        switch (result.status) {
            case 'completed':
                return 'success' as const;
            case 'failed':
                return 'failure' as const;
            case 'interrupted':
                return 'interruption' as const;
        }
    };

    try {
        await expect(
            tracePromise(
                runtime,
                'haus.agent.turn',
                { 'haus.operation': 'test.completed' },
                async () => completed,
                undefined,
                undefined,
                outcomeFromResult
            )
        ).resolves.toBe(completed);
        await expect(
            tracePromise(
                runtime,
                'haus.agent.turn',
                { 'haus.operation': 'test.failed' },
                async () => failed,
                undefined,
                undefined,
                outcomeFromResult
            )
        ).resolves.toBe(failed);
        await expect(
            tracePromise(
                runtime,
                'haus.agent.turn',
                { 'haus.operation': 'test.interrupted' },
                async () => interrupted,
                undefined,
                undefined,
                outcomeFromResult
            )
        ).resolves.toBe(interrupted);
        await expect(
            tracePromise(
                runtime,
                'haus.agent.turn',
                { 'haus.operation': 'test.callback-defect' },
                async () => unclassifiable,
                undefined,
                () => {
                    throw new Error('attribute callback defect');
                },
                () => {
                    throwingOutcomeCalls += 1;
                    throw new Error('outcome callback defect');
                }
            )
        ).resolves.toBe(unclassifiable);
        expect(throwingOutcomeCalls).toBe(1);
        await expect(
            tracePromise(
                disabledRuntime,
                'haus.agent.turn',
                {},
                async () => interrupted,
                undefined,
                undefined,
                outcomeFromResult
            )
        ).resolves.toBe(interrupted);

        const spansByOperation = new Map(
            spanExporter
                .getFinishedSpans()
                .map((span) => [span.attributes['haus.operation'], span] as const)
        );
        expect(spansByOperation.get('test.completed')?.status.code).toBe(1);
        expect(spansByOperation.get('test.failed')?.status.code).toBe(2);
        expect(spansByOperation.get('test.interrupted')?.status.code).toBe(1);
        expect(spansByOperation.get('test.callback-defect')?.status.code).toBe(1);

        await metricReader.forceFlush();
        const resourceMetrics = metricExporter.getMetrics();
        const metrics = resourceMetrics.flatMap((resource) =>
            resource.scopeMetrics.flatMap((scope) => scope.metrics)
        );
        const counts = metrics.find((metric) => metric.descriptor.name === 'haus.operation.count');
        expect(
            counts?.dataPoints.map((point) => [
                point.attributes.operation,
                point.attributes.outcome,
            ])
        ).toEqual(
            expect.arrayContaining([
                ['test.completed', 'success'],
                ['test.failed', 'failure'],
                ['test.interrupted', 'interruption'],
                ['test.callback-defect', 'success'],
            ])
        );

        const duration = metrics.find(
            (metric) => metric.descriptor.name === 'haus.operation.duration'
        );
        expect(duration?.descriptor.unit).toBe('ms');
        if (!duration || duration.dataPointType !== DataPointType.HISTOGRAM) {
            throw new Error('Expected the operation duration histogram.');
        }
        expect(duration.dataPoints[0]?.value.buckets.boundaries.at(-1)).toBe(3_600_000);

        const spanInstanceId =
            spanExporter.getFinishedSpans()[0]?.resource.attributes['service.instance.id'];
        const metricInstanceId = resourceMetrics[0]?.resource.attributes['service.instance.id'];
        expect(spanInstanceId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
        );
        expect(metricInstanceId).toBe(spanInstanceId);
    } finally {
        await Promise.all([runtime.dispose(), disabledRuntime.dispose()]);
    }
});

test('typed failures, defects, and interruption keep their Effect identities through spans', async () => {
    const exporter = new InMemorySpanExporter();
    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
    });
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            metricReader,
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    const failure = { _tag: 'ExpectedFailure', secret: 'private failure' } as const;
    const defect = new Error('private defect');

    try {
        const failureExit = await runtime.runPromiseExit(
            Effect.fail(failure).pipe(
                withTelemetrySpan('haus.mcp.operation', {
                    'haus.operation': 'test.effect.failure',
                })
            )
        );
        const defectExit = await runtime.runPromiseExit(
            Effect.die(defect).pipe(
                withTelemetrySpan('haus.mcp.operation', {
                    'haus.operation': 'test.effect.defect',
                })
            )
        );
        const interruptionExit = await runtime.runPromiseExit(
            Effect.interrupt.pipe(
                withTelemetrySpan('haus.mcp.operation', {
                    'haus.operation': 'test.effect.interruption',
                })
            )
        );

        expect(Exit.isFailure(failureExit)).toBe(true);
        expect(
            Exit.isFailure(failureExit)
                ? Option.getOrNull(Cause.failureOption(failureExit.cause))
                : null
        ).toBe(failure);
        expect(
            Exit.isFailure(defectExit) ? Option.getOrNull(Cause.dieOption(defectExit.cause)) : null
        ).toBe(defect);
        expect(
            Exit.isFailure(interruptionExit) && Cause.isInterruptedOnly(interruptionExit.cause)
        ).toBe(true);

        const spansByOperation = new Map(
            exporter
                .getFinishedSpans()
                .map((span) => [span.attributes['haus.operation'], span] as const)
        );
        expect(spansByOperation.get('test.effect.failure')?.status.code).toBe(2);
        expect(spansByOperation.get('test.effect.defect')?.status.code).toBe(2);
        expect(spansByOperation.get('test.effect.interruption')?.status.code).toBe(1);
        expect(
            spansByOperation.get('test.effect.interruption')?.attributes['status.interrupted']
        ).toBe(true);
        const serializedSpans = JSON.stringify(
            exporter
                .getFinishedSpans()
                .map((span) => ({ events: span.events, status: span.status }))
        );
        expect(serializedSpans).not.toContain(failure.secret);
        expect(serializedSpans).not.toContain(defect.message);
        await metricReader.forceFlush();
        const outcomes = metricExporter
            .getMetrics()
            .flatMap((resource) => resource.scopeMetrics)
            .flatMap((scope) => scope.metrics)
            .find((metric) => metric.descriptor.name === 'haus.operation.count')
            ?.dataPoints.map((point) => [point.attributes.operation, point.attributes.outcome]);
        expect(outcomes).toEqual(
            expect.arrayContaining([
                ['test.effect.failure', 'failure'],
                ['test.effect.defect', 'failure'],
                ['test.effect.interruption', 'interruption'],
            ])
        );
    } finally {
        await runtime.dispose();
    }
});
