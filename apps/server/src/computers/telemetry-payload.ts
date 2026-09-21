import { agentReasoningEffortSchema } from '@haus/api';
import type { OtlpSignal } from '@haus/effect';
import { z } from 'zod';
import {
    metricsPayloadSchema,
    type TelemetryAttributes,
    tracesPayloadSchema,
} from './telemetry-payload-schema.ts';
import { telemetryProtobuf } from './telemetry-protobuf.ts';

export interface TelemetryComputer {
    readonly agents: ReadonlyArray<{
        id: string;
        desiredModelId: string | null;
        desiredRuntimeId: string | null;
    }>;
    readonly id: string;
    readonly serverId: string;
}

const spanNames = new Set(['haus.agent.turn', 'haus.browser.operation', 'haus.mcp.operation']);
const metricNames = new Set([
    'haus.operation.count',
    'haus.operation.duration',
    'effect_fiber_started',
    'effect_fiber_active',
    'effect_fiber_successes',
    'effect_fiber_failures',
    'effect_fiber_lifetimes',
]);
const operations = new Set(['agent.turn', 'browser.get', 'browser.save', ...spanNames]);
const outcomes = new Set([
    'success',
    'failure',
    'interruption',
    'completed',
    'failed',
    'interrupted',
]);
const failures = new Set([
    'authentication',
    'configuration',
    'input',
    'rate-limit',
    'session-resume',
    'timeout',
    'transport',
    'unknown',
]);
const diagnosticId = /^[a-zA-Z0-9_-]{1,128}$/u;

export function sanitizeComputerTelemetry(
    signal: OtlpSignal,
    payload: Uint8Array,
    computer: TelemetryComputer,
    environment: 'development' | 'production' | 'test'
): Uint8Array {
    if (payload.byteLength > 1024 * 1024) {
        throw new Error('Telemetry payload is too large.');
    }
    const codec = telemetryProtobuf[signal];
    const decoded: unknown = codec.toObject(codec.decode(payload), { longs: String });
    const resourceFor = (attributes: TelemetryAttributes) =>
        authoritativeResource(attributes, computer, environment);
    const sanitized =
        signal === 'traces'
            ? sanitizeTraces(decoded, computer, resourceFor)
            : sanitizeMetrics(decoded, resourceFor);
    return codec.encode(codec.fromObject(sanitized)).finish();
}

function sanitizeTraces(
    decoded: unknown,
    computer: TelemetryComputer,
    resourceFor: (attributes: TelemetryAttributes) => { attributes: TelemetryAttributes }
) {
    const payload = tracesPayloadSchema.parse(decoded);
    return {
        resourceSpans: payload.resourceSpans.map((group) => ({
            resource: resourceFor(group.resource.attributes),
            scopeSpans: group.scopeSpans.map((scope) => ({
                spans: scope.spans
                    .filter((span) => spanNames.has(span.name))
                    .map((span) => ({
                        ...span,
                        flags: (span.flags ?? 0) & 0x3_ff,
                        attributes: safeSpanAttributes(span.attributes, computer),
                    })),
            })),
        })),
    };
}

function sanitizeMetrics(
    decoded: unknown,
    resourceFor: (attributes: TelemetryAttributes) => { attributes: TelemetryAttributes }
) {
    const payload = metricsPayloadSchema.parse(decoded);
    return {
        resourceMetrics: payload.resourceMetrics.map((group) => {
            z.uuid().parse(
                group.resource.attributes.find(({ key }) => key === 'service.instance.id')?.value
                    .stringValue
            );
            return {
                resource: resourceFor(group.resource.attributes),
                scopeMetrics: group.scopeMetrics.map((scope) => ({
                    metrics: scope.metrics
                        .filter((metric) => metricNames.has(metric.name))
                        .map((metric) => {
                            validateMetricKind(metric);
                            return {
                                name: metric.name,
                                unit:
                                    metric.name === 'haus.operation.duration'
                                        ? 'ms'
                                        : metric.name === 'effect_fiber_lifetimes'
                                          ? 'milliseconds'
                                          : '1',
                                ...(metric.sum
                                    ? {
                                          sum: {
                                              ...metric.sum,
                                              dataPoints: metric.sum.dataPoints.map(safePoint),
                                          },
                                      }
                                    : {}),
                                ...(metric.histogram
                                    ? {
                                          histogram: {
                                              ...metric.histogram,
                                              dataPoints:
                                                  metric.histogram.dataPoints.map(safePoint),
                                          },
                                      }
                                    : {}),
                            };
                        }),
                })),
            };
        }),
    };
}

function validateMetricKind(
    metric: z.infer<
        typeof metricsPayloadSchema
    >['resourceMetrics'][number]['scopeMetrics'][number]['metrics'][number]
): void {
    const histogram =
        metric.name === 'haus.operation.duration' || metric.name === 'effect_fiber_lifetimes';
    const valid = histogram
        ? metric.histogram?.aggregationTemporality === 2
        : metric.sum?.aggregationTemporality === 2 &&
          Boolean(metric.sum.isMonotonic) === (metric.name !== 'effect_fiber_active');
    if (!valid) {
        throw new Error('Unexpected telemetry instrument type.');
    }
}

function safePoint<Point extends { attributes: TelemetryAttributes }>(point: Point): Point {
    return {
        ...point,
        attributes: point.attributes
            .filter(
                ({ key, value }) =>
                    (key === 'operation' && operations.has(value.stringValue ?? '')) ||
                    (key === 'outcome' && outcomes.has(value.stringValue ?? ''))
            )
            .filter(uniqueAttribute),
    };
}

function authoritativeResource(
    attributes: TelemetryAttributes,
    computer: TelemetryComputer,
    environment: string
) {
    const instance = attributes.find(({ key }) => key === 'service.instance.id')?.value.stringValue;
    return {
        attributes: Object.entries({
            'service.name': 'haus-computer',
            'service.namespace': 'haus',
            'deployment.environment.name': environment,
            'haus.computer.id': computer.id,
            'haus.server.id': computer.serverId,
            'haus.telemetry.source': 'computer-relay',
            ...(instance && z.uuid().safeParse(instance).success
                ? { 'service.instance.id': `${computer.id}/${instance}` }
                : {}),
        }).map(([key, stringValue]) => ({ key, value: { stringValue } })),
    };
}

function safeSpanAttributes(
    attributes: TelemetryAttributes,
    computer: TelemetryComputer
): TelemetryAttributes {
    const agentId = attributes.find(({ key }) => key === 'haus.agent.id')?.value.stringValue;
    const agent = computer.agents.find(({ id }) => id === agentId);
    return attributes
        .filter(({ key, value }) => {
            switch (key) {
                case 'haus.agent.id':
                    return value.stringValue === agent?.id && agent !== undefined;
                case 'haus.model.id':
                    return agent !== undefined && value.stringValue === agent.desiredModelId;
                case 'haus.runtime.id':
                    return agent !== undefined && value.stringValue === agent.desiredRuntimeId;
                case 'haus.run.id':
                case 'haus.chat.id':
                case 'haus.request.id':
                    return diagnosticId.test(value.stringValue ?? '');
                case 'haus.operation':
                    return operations.has(value.stringValue ?? '');
                case 'haus.outcome':
                    return outcomes.has(value.stringValue ?? '');
                case 'haus.failure.kind':
                    return failures.has(value.stringValue ?? '');
                case 'haus.reasoning.effort':
                    return agentReasoningEffortSchema.safeParse(value.stringValue).success;
                case 'haus.turn.harness_ready_ms':
                case 'haus.turn.bootstrap_ms':
                case 'haus.turn.session_create_ms':
                case 'haus.turn.first_stream_ms':
                case 'haus.turn.first_tool_ms':
                case 'haus.turn.first_send_ms':
                case 'haus.turn.last_send_ms':
                case 'haus.turn.after_last_send_ms': {
                    const duration = value.doubleValue ?? Number(value.intValue);
                    return Number.isFinite(duration) && duration >= 0 && duration <= 604_800_000;
                }
                case 'haus.tokens.input':
                case 'haus.tokens.output':
                case 'haus.tokens.cache_read':
                case 'haus.tokens.cache_write':
                    return /^\d{1,12}$/u.test(value.intValue ?? String(value.doubleValue));
                case 'haus.output.produced':
                    return value.boolValue !== undefined;
                case 'haus.message.count':
                case 'haus.retry.count':
                    return /^\d{1,9}$/u.test(value.intValue ?? String(value.doubleValue));
                default:
                    return false;
            }
        })
        .filter(uniqueAttribute)
        .map(({ key, value }) => ({ key, value: primitiveValue(value) }));
}

function primitiveValue(
    value: TelemetryAttributes[number]['value']
): TelemetryAttributes[number]['value'] {
    if (value.stringValue !== undefined) {
        return { stringValue: value.stringValue };
    }
    if (value.boolValue !== undefined) {
        return { boolValue: value.boolValue };
    }
    if (value.intValue !== undefined) {
        return { intValue: value.intValue };
    }
    return { doubleValue: value.doubleValue };
}

function uniqueAttribute(
    attribute: TelemetryAttributes[number],
    index: number,
    attributes: TelemetryAttributes
): boolean {
    return attributes.findIndex(({ key }) => key === attribute.key) === index;
}
