import { expect, test } from 'bun:test';
import {
    AggregationTemporality,
    InMemoryMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import { makeProcessTelemetryRelay } from './telemetry-relay.ts';
import {
    makeProcessTelemetryLayer,
    makeTelemetryLayer,
    parseTraceCarrier,
    sanitizeTelemetryAttributes,
    tracePromise,
} from './telemetry.ts';

test('exports parented spans across an explicit trace carrier', async () => {
    const exporter = new InMemorySpanExporter();
    const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
    });
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            deploymentEnvironment: 'development',
            metricReader,
            releaseId: '1.2.3+git.abc123',
            serviceName: 'haus-test',
            serviceRevision: 'abc123',
            serviceVersion: '1.2.3',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    let dispatchSpanId: string | undefined;
    let deploymentEnvironment: unknown;
    let metricNames: string[] = [];
    let metricOperations: unknown[] = [];
    let metricOutcomes: unknown[] = [];
    let resourceAttributes: Record<string, unknown> = {};
    let turnParentSpanId: string | undefined;
    let turnOutcome: unknown;
    let traceIds: string[] = [];
    try {
        const parent = await tracePromise(
            runtime,
            'haus.agent.dispatch',
            { 'haus.run.id': 'run_123' },
            async (carrier) => carrier
        );
        await tracePromise(
            runtime,
            'haus.agent.turn',
            { 'haus.run.id': 'run_123' },
            async () => ({ status: 'failed' as const }),
            parent,
            (result) => ({ 'haus.outcome': result.status }),
            (result) => (result.status === 'failed' ? 'failure' : 'success')
        );
        const spans = exporter.getFinishedSpans();
        const dispatch = spans.find((span) => span.name === 'haus.agent.dispatch');
        const turn = spans.find((span) => span.name === 'haus.agent.turn');
        dispatchSpanId = dispatch?.spanContext().spanId;
        deploymentEnvironment = dispatch?.resource.attributes['deployment.environment.name'];
        resourceAttributes = dispatch?.resource.attributes ?? {};
        turnParentSpanId = turn?.parentSpanContext?.spanId;
        turnOutcome = turn?.attributes['haus.outcome'];
        traceIds = spans.map((span) => span.spanContext().traceId);
        await metricReader.forceFlush();
        const metrics = metricExporter
            .getMetrics()
            .flatMap((resource) => resource.scopeMetrics)
            .flatMap((scope) => scope.metrics);
        metricNames = metrics.map((metric) => metric.descriptor.name);
        metricOperations = metrics.flatMap((metric) =>
            metric.dataPoints.map((point) => point.attributes.operation)
        );
        metricOutcomes = metrics.flatMap((metric) =>
            metric.dataPoints.map((point) => point.attributes.outcome)
        );
    } finally {
        await runtime.dispose();
    }

    expect(traceIds).toHaveLength(2);
    expect(new Set(traceIds).size).toBe(1);
    expect(turnParentSpanId).toBe(dispatchSpanId);
    expect(turnOutcome).toBe('failed');
    expect(deploymentEnvironment).toBe('development');
    expect(resourceAttributes).toMatchObject({
        'haus.release.id': '1.2.3+git.abc123',
        'haus.release.revision': 'abc123',
        'service.namespace': 'haus',
        'service.version': '1.2.3',
    });
    expect(metricNames).toContain('haus.operation.count');
    expect(metricNames).toContain('haus.operation.duration');
    expect(metricOperations).toContain('haus.agent.turn');
    expect(metricOutcomes).toContain('failure');
});

test('relays protobuf signals with only configured upstream headers', async () => {
    const requests: Array<{ body: Uint8Array; headers: Headers; url: string }> = [];
    const relay = makeProcessTelemetryRelay({
        environment: {
            OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'https://telemetry.example/v1/metrics',
            OTEL_EXPORTER_OTLP_METRICS_HEADERS:
                'Authorization=Bearer%20metrics,X-Axiom-Metrics-Dataset=haus-metrics',
            OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://telemetry.example/v1/traces',
            OTEL_EXPORTER_OTLP_TRACES_HEADERS:
                'Authorization=Bearer%20traces,X-Axiom-Dataset=haus-operations',
        },
        fetch: async (input, init) => {
            requests.push({
                body: new Uint8Array(await new Response(init?.body).arrayBuffer()),
                headers: new Headers(init?.headers),
                url: String(input),
            });
            return new Response(null, { status: 200 });
        },
    });

    expect(relay).not.toBeNull();
    await relay?.forward('traces', Uint8Array.from([1, 2, 3]));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://telemetry.example/v1/traces');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer traces');
    expect(requests[0]?.headers.get('x-axiom-dataset')).toBe('haus-operations');
    expect(requests[0]?.headers.get('x-axiom-metrics-dataset')).toBeNull();
    expect(requests[0]?.headers.get('content-type')).toBe('application/x-protobuf');
    expect([...(requests[0]?.body ?? [])]).toEqual([1, 2, 3]);
});

test('drops arbitrary content and rejects malformed trace carriers', () => {
    expect(
        sanitizeTelemetryAttributes({
            'haus.operation': 'agent.turn',
            'message.content': 'private prompt',
            token: 'secret',
        })
    ).toEqual({ 'haus.operation': 'agent.turn' });
    expect(parseTraceCarrier({ traceparent: 'not-a-trace' })).toBeNull();
    expect(
        parseTraceCarrier({
            traceparent: '00-00000000000000000000000000000000-0000000000000000-01',
        })
    ).toBeNull();
});

test('exports only a generic exception while preserving the original failure', async () => {
    const exporter = new InMemorySpanExporter();
    const runtime = ManagedRuntime.make(
        makeTelemetryLayer({
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    const failure = new Error('private prompt and upstream token');
    let caught: unknown;
    let serializedSpan = '';
    try {
        await tracePromise(runtime, 'haus.agent.turn', {}, async () => {
            throw failure;
        });
    } catch (error) {
        caught = error;
    } finally {
        serializedSpan = JSON.stringify(
            exporter
                .getFinishedSpans()
                .map((span) => ({ events: span.events, status: span.status }))
        );
        await runtime.dispose();
    }

    expect(caught).toBe(failure);
    expect(serializedSpan).not.toContain(failure.message);
    expect(serializedSpan).toContain('TelemetrySpanFailure');
});

test('runs traced operations without an exporter when telemetry is disabled', async () => {
    const runtime = ManagedRuntime.make(
        makeProcessTelemetryLayer({ environment: {}, serviceName: 'haus-test' })
    );
    const disabledRuntime = ManagedRuntime.make(
        makeProcessTelemetryLayer({
            environment: {
                OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
                OTEL_SDK_DISABLED: 'true',
            },
            serviceName: 'haus-test',
        })
    );
    try {
        await expect(
            tracePromise(runtime, 'haus.agent.turn', {}, async () => 'unconfigured')
        ).resolves.toBe('unconfigured');
        await expect(
            tracePromise(disabledRuntime, 'haus.agent.turn', {}, async () => 'disabled')
        ).resolves.toBe('disabled');
    } finally {
        await Promise.all([runtime.dispose(), disabledRuntime.dispose()]);
    }
});
