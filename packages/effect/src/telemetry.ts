import {
    sanitizeTelemetryAttributes,
    type TelemetryAttributes,
    type TelemetryAttributeValue,
} from './telemetry-attributes.ts';

export {
    sanitizeTelemetryAttributes,
    type TelemetryAttributeKey,
    type TelemetryAttributes,
    type TelemetryAttributeValue,
    telemetryAttributeKeys,
} from './telemetry-attributes.ts';

import { randomUUID } from 'node:crypto';
import * as OtelMetrics from '@effect/opentelemetry/Metrics';
import * as OtelNodeSdk from '@effect/opentelemetry/NodeSdk';
import * as OtelResource from '@effect/opentelemetry/Resource';
import * as OtelTracer from '@effect/opentelemetry/Tracer';
import { isSpanContextValid, type SpanContext, TraceFlags } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { type MetricReader, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
    ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
    ATTR_SERVICE_INSTANCE_ID,
    ATTR_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { Clock, Data, Effect, Layer } from 'effect';
import type { DurationInput } from 'effect/Duration';
import type { EffectRuntime } from './boundary.ts';
import { settle } from './boundary.ts';
import {
    exporterConfig,
    type ProcessTelemetryEnvironment,
    parseDeploymentEnvironment,
    readProcessTelemetryEnvironment,
    relayEnvironment,
    type TelemetryRelayConnection,
    telemetryDisabled,
    telemetryEnabled,
} from './telemetry-configuration.ts';
import {
    type ObservedTelemetryResult,
    originalTelemetryExit,
    telemetrySpanExit,
} from './telemetry-failure.ts';
import {
    instrumentOperation,
    safeOutcomeFromResult,
    type TelemetryOutcome,
} from './telemetry-metrics.ts';

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u;
const serviceInstanceId = randomUUID();

export type TelemetrySpanName =
    | 'haus.agent.dispatch'
    | 'haus.agent.turn'
    | 'haus.browser.operation'
    | 'haus.computer_secrets.operation'
    | 'haus.heartbeat.check'
    | 'haus.heartbeat.request'
    | 'haus.mcp.operation'
    | 'haus.hosted-mcp.lifecycle'
    | 'haus.hosted-mcp.request'
    | 'haus.server.startup'
    | 'haus.trigger.fire';

export interface TraceCarrier {
    readonly traceparent: string;
}

export interface TelemetryLayerOptions {
    readonly deploymentEnvironment?: 'development' | 'production' | 'test';
    readonly metricReader?: MetricReader;
    readonly releaseId?: string;
    readonly serviceName: 'haus-computer' | 'haus-server' | 'haus-test';
    readonly serviceRevision?: string;
    readonly serviceVersion?: string;
    readonly shutdownTimeout?: DurationInput;
    readonly spanProcessor?: SpanProcessor;
}

class TelemetryOperationError extends Data.TaggedError('TelemetryOperationError')<{
    readonly cause: unknown;
}> {}

export function makeProcessTelemetryLayer(
    options: Omit<TelemetryLayerOptions, 'spanProcessor'> & {
        readonly environment?: ProcessTelemetryEnvironment;
        readonly relay?: TelemetryRelayConnection;
    }
): Layer.Layer<never> {
    const processEnvironment = options.environment ?? readProcessTelemetryEnvironment();
    if (telemetryDisabled(processEnvironment)) {
        return Layer.empty;
    }
    const usingRelay = !telemetryEnabled(processEnvironment) && Boolean(options.relay);
    const environment =
        usingRelay && options.relay ? relayEnvironment(options.relay) : processEnvironment;
    if (!telemetryEnabled(environment)) {
        return Layer.empty;
    }
    const sharedEndpoint = environment.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
    const metricsEnabled = Boolean(
        sharedEndpoint || environment.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim()
    );
    const tracesEnabled = Boolean(
        sharedEndpoint || environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim()
    );
    return makeTelemetryLayer({
        ...options,
        deploymentEnvironment:
            options.deploymentEnvironment ??
            (usingRelay && options.relay
                ? options.relay.deploymentEnvironment
                : parseDeploymentEnvironment(environment.OTEL_RESOURCE_ATTRIBUTES)),
        metricReader: metricsEnabled
            ? new PeriodicExportingMetricReader({
                  exporter: new OTLPMetricExporter(exporterConfig(environment, 'metrics')),
              })
            : undefined,
        spanProcessor: tracesEnabled
            ? new BatchSpanProcessor(new OTLPTraceExporter(exporterConfig(environment, 'traces')))
            : undefined,
    });
}

export function makeTelemetryLayer(options: TelemetryLayerOptions): Layer.Layer<never> {
    if (!(options.spanProcessor || options.metricReader)) {
        return Layer.empty;
    }
    const resource = OtelResource.layer({
        attributes: {
            [ATTR_SERVICE_NAMESPACE]: 'haus',
            [ATTR_SERVICE_INSTANCE_ID]: serviceInstanceId,
            ...(options.deploymentEnvironment
                ? { [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: options.deploymentEnvironment }
                : {}),
            ...(options.releaseId ? { 'haus.release.id': options.releaseId } : {}),
            ...(options.serviceRevision
                ? { 'haus.release.revision': options.serviceRevision }
                : {}),
        },
        serviceName: options.serviceName,
        serviceVersion: options.serviceVersion,
    });
    const tracing = options.spanProcessor
        ? makeTracingLayer(resource, options.spanProcessor, options.shutdownTimeout)
        : Layer.empty;
    const metrics = options.metricReader
        ? OtelMetrics.layer(() => options.metricReader as MetricReader, {
              shutdownTimeout: options.shutdownTimeout ?? 3000,
          }).pipe(Layer.provide(resource))
        : Layer.empty;
    return Layer.merge(tracing, metrics);
}

export async function tracePromise<A, R>(
    runtime: EffectRuntime<R>,
    name: TelemetrySpanName,
    attributes: TelemetryAttributes,
    operation: (carrier: TraceCarrier) => Promise<A>,
    parent?: TraceCarrier,
    attributesFromResult?: (value: A) => TelemetryAttributes,
    outcomeFromResult?: (value: A) => TelemetryOutcome
): Promise<A> {
    const program = Effect.gen(function* () {
        const carrier = yield* currentTraceCarrier;
        const value = yield* Effect.tryPromise({
            catch: (cause) => new TelemetryOperationError({ cause }),
            try: () => operation(carrier),
        });
        if (attributesFromResult) {
            yield* Effect.annotateCurrentSpan(safeResultAttributes(value, attributesFromResult));
        }
        return value;
    }).pipe(withTelemetrySpan(name, attributes, outcomeFromResult), withTraceCarrier(parent));
    return settle(runtime, program, {
        mapFailure: (failure) => failure.cause,
    });
}

export function withTelemetrySpan<A>(
    name: TelemetrySpanName,
    attributes: TelemetryAttributes,
    outcomeFromResult?: (value: A) => TelemetryOutcome
) {
    return <E, R>(effect: Effect.Effect<A, E, R>) => {
        const operation = String(attributes['haus.operation'] ?? name);
        const observed = effect.pipe(
            Effect.map(
                (value): ObservedTelemetryResult<A> => [
                    value,
                    safeOutcomeFromResult(value, outcomeFromResult),
                ]
            ),
            (operationEffect) =>
                instrumentOperation(operationEffect, operation, (result) => result[1])
        );
        return Effect.useSpan(
            name,
            { attributes: sanitizeTelemetryAttributes(attributes) },
            (span) =>
                Effect.exit(observed.pipe(Effect.withParentSpan(span))).pipe(
                    Effect.map(originalTelemetryExit),
                    Effect.flatMap((exit) =>
                        Clock.currentTimeNanos.pipe(
                            Effect.flatMap((endedAt) =>
                                Effect.sync(() => span.end(endedAt, telemetrySpanExit(exit)))
                            ),
                            Effect.as(exit)
                        )
                    )
                )
        ).pipe(
            Effect.flatten,
            Effect.map((result) => result[0])
        );
    };
}

export function withTraceCarrier(parent?: TraceCarrier) {
    return <A, E, R>(effect: Effect.Effect<A, E, R>) => {
        const context = parent ? parseTraceCarrier(parent) : null;
        return context ? OtelTracer.withSpanContext(effect, context) : effect;
    };
}

export function parseTraceCarrier(carrier: TraceCarrier): SpanContext | null {
    const match = traceparentPattern.exec(carrier.traceparent);
    if (!match) {
        return null;
    }
    const context = {
        isRemote: true,
        spanId: match[2],
        traceFlags: Number.parseInt(match[3], 16) & TraceFlags.SAMPLED,
        traceId: match[1],
    } satisfies SpanContext;
    return isSpanContextValid(context) ? context : null;
}

const currentTraceCarrier = OtelTracer.currentOtelSpan.pipe(
    Effect.map((span) => carrierFromSpanContext(span.spanContext())),
    Effect.catchAll((cause) => Effect.fail(new TelemetryOperationError({ cause })))
);

function carrierFromSpanContext(context: SpanContext): TraceCarrier {
    return {
        traceparent: `00-${context.traceId}-${context.spanId}-${context.traceFlags.toString(16).padStart(2, '0')}`,
    };
}

function safeResultAttributes<A>(
    value: A,
    attributesFromResult: (value: A) => TelemetryAttributes
): Record<string, TelemetryAttributeValue> {
    try {
        return sanitizeTelemetryAttributes(attributesFromResult(value));
    } catch {
        return {};
    }
}

function makeTracingLayer(
    resource: Layer.Layer<OtelResource.Resource>,
    spanProcessor: SpanProcessor,
    shutdownTimeout?: DurationInput
): Layer.Layer<never> {
    const provider = OtelNodeSdk.layerTracerProvider(spanProcessor, {
        shutdownTimeout: shutdownTimeout ?? 3000,
    }).pipe(Layer.provide(resource));
    const tracer = OtelTracer.layerTracer.pipe(Layer.provide(Layer.merge(resource, provider)));
    return OtelTracer.layerWithoutOtelTracer.pipe(Layer.provide(tracer));
}
