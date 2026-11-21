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

/** A finished span the Agent runner recorded, re-exported through the Server's pipeline. */
export interface RelayedSpan {
    readonly attributes: TelemetryAttributes;
    readonly endedAtMs: number;
    readonly failed: boolean;
    readonly name: 'haus.agent.turn';
    readonly parentSpanId?: string;
    readonly sampled: boolean;
    readonly spanId: string;
    readonly startedAtMs: number;
    readonly traceId: string;
}

const relayedSource = 'haus-runner';
const relayedSpanSink = FiberRef.unsafeMake<((span: RelayedSpan) => void) | null>(null);

/**
 * Re-export a span the Agent runner recorded. A no-op when this runtime
 * exports no traces; a span with invalid ids or timing is dropped.
 */
export function relaySpan(runtime: EffectRuntime<never>, span: RelayedSpan) {
    return settle(runtime, FiberRef.get(relayedSpanSink).pipe(Effect.map((sink) => sink?.(span))));
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
        status: { code: span.failed ? SpanStatusCode.ERROR : SpanStatusCode.OK },
    };
    return readable;
}

function hrTime(milliseconds: number) {
    const seconds = Math.floor(milliseconds / 1000);
    const time: HrTime = [seconds, Math.floor((milliseconds - seconds * 1000) * 1_000_000)];
    return time;
}
