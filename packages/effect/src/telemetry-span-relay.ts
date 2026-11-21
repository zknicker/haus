import {
    type HrTime,
    isSpanContextValid,
    type SpanContext,
    SpanKind,
    SpanStatusCode,
    TraceFlags,
} from '@opentelemetry/api';
import { type Resource, resourceFromAttributes } from '@opentelemetry/resources';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
    ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { Effect, FiberRef, Layer } from 'effect';
import { type EffectRuntime, settle } from './boundary.ts';
import { sanitizeTelemetryAttributes, type TelemetryAttributes } from './telemetry-attributes.ts';
import { recordOperation, type TelemetryOutcome } from './telemetry-metrics.ts';

/** A finished span the Agent runner recorded, re-exported through the Server's pipeline. */
export interface RelayedSpan {
    readonly attributes: TelemetryAttributes;
    readonly endedAtMs: number;
    readonly name: 'haus.agent.turn';
    /** Sets the span status and the `outcome` of its `haus.operation.*` metrics. */
    readonly outcome: TelemetryOutcome;
    readonly parentSpanId?: string;
    readonly sampled: boolean;
    readonly spanId: string;
    readonly startedAtMs: number;
    readonly traceId: string;
}

const relayedSource = 'haus-runner';
const relayedSpanSink = FiberRef.unsafeMake<((span: RelayedSpan) => void) | null>(null);

/**
 * Re-export a span the Agent runner recorded and count it in
 * `haus.operation.count` and `haus.operation.duration`, as a local operation
 * span would be. The span export is a no-op when this runtime exports no
 * traces; a span with invalid ids or timing is dropped and not counted.
 */
export function relaySpan(runtime: EffectRuntime<never>, span: RelayedSpan) {
    const program = Effect.gen(function* () {
        if (!relayedContexts(span)) {
            return;
        }
        const sink = yield* FiberRef.get(relayedSpanSink);
        sink?.(span);
        yield* recordOperation(
            String(span.attributes['haus.operation'] ?? span.name),
            span.outcome,
            span.endedAtMs - span.startedAtMs
        );
    });
    return settle(runtime, program);
}

export function relayedSpanLayer(spanProcessor: SpanProcessor, deploymentEnvironment?: string) {
    const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: relayedSource,
        [ATTR_SERVICE_NAMESPACE]: 'haus',
        ...(deploymentEnvironment
            ? { [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnvironment }
            : {}),
        'haus.telemetry.source': `${relayedSource}-relay`,
    });
    return Layer.locallyScoped(relayedSpanSink, (span) => {
        const readable = readableSpan(span, resource);
        if (readable) {
            spanProcessor.onEnd(readable);
        }
    });
}

function readableSpan(span: RelayedSpan, resource: Resource) {
    const contexts = relayedContexts(span);
    if (!contexts) {
        return null;
    }
    const { context, parent } = contexts;
    const readable: ReadableSpan = {
        attributes: sanitizeTelemetryAttributes(span.attributes),
        droppedAttributesCount: 0,
        droppedEventsCount: 0,
        droppedLinksCount: 0,
        duration: hrTime(span.endedAtMs - span.startedAtMs),
        ended: true,
        endTime: hrTime(span.endedAtMs),
        events: [],
        instrumentationScope: { name: relayedSource },
        kind: SpanKind.INTERNAL,
        links: [],
        name: span.name,
        ...(parent ? { parentSpanContext: parent } : {}),
        resource,
        spanContext: () => context,
        startTime: hrTime(span.startedAtMs),
        status: {
            code: span.outcome === 'failure' ? SpanStatusCode.ERROR : SpanStatusCode.OK,
        },
    };
    return readable;
}

function relayedContexts(span: RelayedSpan) {
    const traceFlags = span.sampled ? TraceFlags.SAMPLED : TraceFlags.NONE;
    const context: SpanContext = { spanId: span.spanId, traceFlags, traceId: span.traceId };
    const parent: SpanContext | undefined = span.parentSpanId
        ? { isRemote: true, spanId: span.parentSpanId, traceFlags, traceId: span.traceId }
        : undefined;
    const timed =
        Number.isFinite(span.startedAtMs) &&
        Number.isFinite(span.endedAtMs) &&
        span.startedAtMs > 0 &&
        span.endedAtMs >= span.startedAtMs;
    if (!(timed && isSpanContextValid(context)) || (parent && !isSpanContextValid(parent))) {
        return null;
    }
    return { context, parent };
}

function hrTime(milliseconds: number) {
    const seconds = Math.floor(milliseconds / 1000);
    const time: HrTime = [seconds, Math.floor((milliseconds - seconds * 1000) * 1_000_000)];
    return time;
}
