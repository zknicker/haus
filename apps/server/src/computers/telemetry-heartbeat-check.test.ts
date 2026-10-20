import { expect, test } from 'bun:test';
import { sanitizeComputerTelemetry } from './telemetry-payload.ts';
import { telemetryProtobuf } from './telemetry-protobuf.ts';

const computer = {
    agents: [{ desiredModelId: 'terra', desiredRuntimeId: 'codex', id: 'agt_owned' }],
    id: 'cmp_test',
    serverId: 'srv_test',
};

function relayedAttributes(attributes: Array<{ key: string; value: object }>) {
    const codec = telemetryProtobuf.traces;
    const payload = codec
        .encode(
            codec.fromObject({
                resourceSpans: [
                    {
                        scopeSpans: [
                            {
                                spans: [
                                    {
                                        attributes,
                                        endTimeUnixNano: '2000000000',
                                        name: 'haus.heartbeat.check',
                                        spanId: Buffer.alloc(8, 2),
                                        startTimeUnixNano: '1000000000',
                                        traceId: Buffer.alloc(16, 1),
                                    },
                                ],
                            },
                        ],
                    },
                ],
            })
        )
        .finish();
    const sanitized = codec.toObject(
        codec.decode(sanitizeComputerTelemetry('traces', payload, computer, 'production')),
        { longs: String }
    ) as {
        resourceSpans: Array<{
            scopeSpans: Array<{ spans: Array<{ attributes?: Array<{ key: string }> }> }>;
        }>;
    };
    const [span] = sanitized.resourceSpans[0]?.scopeSpans[0]?.spans ?? [];
    expect(span).toBeDefined();
    return (span?.attributes ?? []).map(({ key }) => key);
}

test('relays a heartbeat check with its closed kind, outcome, reason, date, and slot', () => {
    expect(
        relayedAttributes([
            { key: 'haus.agent.id', value: { stringValue: 'agt_owned' } },
            { key: 'haus.heartbeat.kind', value: { stringValue: 'nightly' } },
            { key: 'haus.heartbeat.local_date', value: { stringValue: '2026-10-12' } },
            { key: 'haus.heartbeat.outcome', value: { stringValue: 'skipped' } },
            { key: 'haus.heartbeat.skip_reason', value: { stringValue: 'resetting' } },
            { key: 'haus.heartbeat.slot', value: { stringValue: '03:30' } },
        ])
    ).toEqual([
        'haus.agent.id',
        'haus.heartbeat.kind',
        'haus.heartbeat.local_date',
        'haus.heartbeat.outcome',
        'haus.heartbeat.skip_reason',
        'haus.heartbeat.slot',
    ]);
});

test('drops a heartbeat check value outside its closed vocabulary', () => {
    expect(
        relayedAttributes([
            { key: 'haus.agent.id', value: { stringValue: 'agt_foreign' } },
            { key: 'haus.heartbeat.kind', value: { stringValue: 'secret' } },
            { key: 'haus.heartbeat.local_date', value: { stringValue: 'tonight secret' } },
            { key: 'haus.heartbeat.outcome', value: { stringValue: 'secret' } },
            { key: 'haus.heartbeat.skip_reason', value: { stringValue: 'secret' } },
            { key: 'haus.heartbeat.slot', value: { stringValue: 'secret' } },
        ])
    ).toEqual([]);
});
