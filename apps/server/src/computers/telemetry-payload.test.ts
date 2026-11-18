import { expect, test } from 'bun:test';
import { makeProcessTelemetryLayer, withTelemetrySpan } from '@haus/effect';
import { Effect, ManagedRuntime } from 'effect';
import Fastify from 'fastify';
import { Field, Root } from 'protobufjs';
import { sanitizeComputerTelemetry } from './telemetry-payload.ts';
import { telemetryProtobuf } from './telemetry-protobuf.ts';

const computer = {
    id: 'cmp_owned',
    serverId: 'srv_owned',
    agents: [{ id: 'agt_owned', desiredModelId: 'terra', desiredRuntimeId: 'codex' }],
};
const span = {
    traceId: Buffer.alloc(16, 1),
    spanId: Buffer.alloc(8, 2),
    name: 'haus.agent.turn',
    startTimeUnixNano: '1000000000',
    endTimeUnixNano: '361000000000',
    status: { code: 2 },
};
const attribute = (key: string, stringValue: string) => ({ key, value: { stringValue } });

test('drops content and forged resources while retaining safe diagnostic turn evidence', () => {
    const codec = telemetryProtobuf.traces;
    const encoded = codec
        .encode(
            codec.fromObject({
                resourceSpans: [
                    {
                        resource: {
                            attributes: [
                                attribute('service.name', 'haus-server'),
                                attribute('deployment.environment.name', 'forged'),
                                attribute('service.version', 'secret'),
                                attribute(
                                    'service.instance.id',
                                    '763a20f0-08a8-4a50-9dc2-824a3587f9e5'
                                ),
                            ],
                        },
                        scopeSpans: [
                            {
                                spans: [
                                    {
                                        ...span,
                                        attributes: [
                                            attribute('prompt', 'secret'),
                                            attribute('haus.server.id', 'forged'),
                                            attribute('haus.agent.id', 'agt_owned'),
                                            attribute('haus.run.id', 'run_test'),
                                            attribute('haus.run.id', 'run_duplicate'),
                                            attribute('haus.model.id', 'secret'),
                                            attribute('haus.outcome', 'failed'),
                                        ],
                                    },
                                    { ...span, name: 'secret arbitrary span' },
                                ],
                            },
                        ],
                    },
                ],
            })
        )
        .finish();
    const result = codec.toObject(
        codec.decode(sanitizeComputerTelemetry('traces', encoded, computer, 'production')),
        { longs: String }
    );
    const text = JSON.stringify(result);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('forged');
    expect(text).not.toContain('duplicate');
    expect(text).toContain('cmp_owned/763a20f0');
    expect(text).toContain('agt_owned');
    expect(text).toContain('run_test');
    expect(text).toContain('361000000000');
});

test('rejects malformed protobuf and invalid spans; strips unknown wire fields', () => {
    expect(() =>
        sanitizeComputerTelemetry('traces', Buffer.from([0x0a, 0xff]), computer, 'production')
    ).toThrow();
    const codec = telemetryProtobuf.traces;
    const invalid = codec
        .encode(
            codec.fromObject({
                resourceSpans: [
                    { scopeSpans: [{ spans: [{ ...span, traceId: Buffer.alloc(16) }] }] },
                ],
            })
        )
        .finish();
    expect(() => sanitizeComputerTelemetry('traces', invalid, computer, 'production')).toThrow();
    const secretField = Buffer.from([0x12, 0x06, ...Buffer.from('secret')]);
    expect(
        sanitizeComputerTelemetry('traces', secretField, computer, 'production').byteLength
    ).toBe(0);
});

test('strips span events, links, error messages and a foreign Agent identity', () => {
    const root = Root.fromJSON(telemetryProtobuf.traces.root.toJSON());
    root.lookupType('Span').add(new Field('events', 11, 'bytes', 'repeated'));
    root.lookupType('Span').add(new Field('links', 13, 'bytes', 'repeated'));
    root.lookupType('Status').add(new Field('message', 2, 'string'));
    const codec = root.lookupType('ExportTracesServiceRequest');
    const bytes = codec
        .encode(
            codec.fromObject({
                resourceSpans: [
                    {
                        scopeSpans: [
                            {
                                spans: [
                                    {
                                        ...span,
                                        events: [Buffer.from('secret')],
                                        links: [Buffer.from('secret')],
                                        status: { code: 2, message: 'secret' },
                                        attributes: [attribute('haus.agent.id', 'agt_foreign')],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
        )
        .finish();
    const clean = sanitizeComputerTelemetry('traces', bytes, computer, 'production');
    const result = JSON.stringify(codec.toObject(codec.decode(clean)));
    expect(result).not.toContain('secret');
    expect(result).not.toContain('agt_foreign');
    expect(result).toContain('"code":2');
});

test('requires independent metric instance identity and correct instrument type', () => {
    const codec = telemetryProtobuf.metrics;
    const metric = {
        name: 'haus.operation.duration',
        sum: {
            aggregationTemporality: 2,
            isMonotonic: true,
            dataPoints: [{ timeUnixNano: '1000', asDouble: 1 }],
        },
    };
    const resource = {
        attributes: [attribute('service.instance.id', '763a20f0-08a8-4a50-9dc2-824a3587f9e5')],
    };
    const encode = (name: string, withResource: boolean) =>
        codec
            .encode(
                codec.fromObject({
                    resourceMetrics: [
                        {
                            resource: withResource ? resource : {},
                            scopeMetrics: [{ metrics: [{ ...metric, name }] }],
                        },
                    ],
                })
            )
            .finish();
    expect(() =>
        sanitizeComputerTelemetry('metrics', encode(metric.name, true), computer, 'production')
    ).toThrow();
    expect(() =>
        sanitizeComputerTelemetry(
            'metrics',
            encode('haus.operation.count', false),
            computer,
            'production'
        )
    ).toThrow();
    expect(() =>
        sanitizeComputerTelemetry(
            'metrics',
            encode('haus.operation.count', true),
            computer,
            'production'
        )
    ).not.toThrow();
});

test('real OTLP trace and metric exporters remain compatible with the relay projection', async () => {
    const received = new Map<string, Uint8Array>();
    const collector = Fastify();
    collector.addContentTypeParser(
        'application/x-protobuf',
        { parseAs: 'buffer' },
        (_request, body, done) => done(null, body)
    );
    for (const signal of ['traces', 'metrics'] as const) {
        collector.post(`/v1/${signal}`, (request, reply) => {
            if (!Buffer.isBuffer(request.body)) {
                throw new Error('Not protobuf');
            }
            received.set(
                signal,
                sanitizeComputerTelemetry(signal, request.body, computer, 'production')
            );
            return reply.code(200).send();
        });
    }
    const address = await collector.listen({ port: 0, host: '127.0.0.1' });
    const runtime = ManagedRuntime.make(
        makeProcessTelemetryLayer({
            serviceName: 'haus-computer',
            environment: { OTEL_EXPORTER_OTLP_ENDPOINT: address },
            deploymentEnvironment: 'development',
        })
    );
    try {
        await runtime.runPromise(
            Effect.void.pipe(
                withTelemetrySpan('haus.agent.turn', {
                    'haus.agent.id': 'agt_owned',
                    'haus.operation': 'agent.turn',
                })
            )
        );
        await runtime.dispose();
        expect([...received.keys()].sort()).toEqual(['metrics', 'traces']);
        for (const signal of ['traces', 'metrics'] as const) {
            const payload = received.get(signal);
            if (!payload) {
                throw new Error(`Missing ${signal}.`);
            }
            const codec = telemetryProtobuf[signal];
            const text = JSON.stringify(codec.toObject(codec.decode(payload), { longs: String }));
            expect(text).toContain('production');
            expect(text).toContain('haus-computer');
            expect(text).toContain(
                signal === 'traces' ? 'haus.agent.turn' : 'haus.operation.duration'
            );
        }
    } finally {
        await runtime.dispose();
        await collector.close();
    }
});
