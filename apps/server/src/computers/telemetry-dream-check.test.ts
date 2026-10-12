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
                                        name: 'haus.dream.check',
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

test('relays a nightly dream check with its closed outcome, reason, date, and memory size', () => {
    expect(
        relayedAttributes([
            { key: 'haus.agent.id', value: { stringValue: 'agt_owned' } },
            { key: 'haus.dream.local_date', value: { stringValue: '2026-10-12' } },
            { key: 'haus.dream.outcome', value: { stringValue: 'skipped' } },
            { key: 'haus.dream.skip_reason', value: { stringValue: 'resetting' } },
            { key: 'haus.memory.bytes', value: { intValue: '4096' } },
        ])
    ).toEqual([
        'haus.agent.id',
        'haus.dream.local_date',
        'haus.dream.outcome',
        'haus.dream.skip_reason',
        'haus.memory.bytes',
    ]);
});

test('drops a dream check value outside its closed vocabulary', () => {
    expect(
        relayedAttributes([
            { key: 'haus.agent.id', value: { stringValue: 'agt_foreign' } },
            { key: 'haus.dream.local_date', value: { stringValue: 'tonight secret' } },
            { key: 'haus.dream.outcome', value: { stringValue: 'secret' } },
            { key: 'haus.dream.skip_reason', value: { stringValue: 'secret' } },
            { key: 'haus.memory.bytes', value: { doubleValue: -1 } },
        ])
    ).toEqual([]);
});
