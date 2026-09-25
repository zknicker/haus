import { expect, test } from 'bun:test';
import { sanitizeComputerTelemetry } from './telemetry-payload.ts';
import { telemetryProtobuf } from './telemetry-protobuf.ts';

test('relays bounded numeric timing and usage without accepting content as a measurement', () => {
    const codec = telemetryProtobuf.traces;
    const attributes = [
        { key: 'haus.reasoning.effort', value: { stringValue: 'medium' } },
        { key: 'haus.turn.session_create_ms', value: { doubleValue: 12.5 } },
        { key: 'haus.turn.first_send_ms', value: { intValue: '20' } },
        { key: 'haus.tokens.input', value: { intValue: '100' } },
        { key: 'haus.tokens.output', value: { doubleValue: 0 } },
        { key: 'haus.turn.sent_chats', value: { intValue: '2' } },
        { key: 'haus.turn.done_chats', value: { stringValue: 'secret' } },
        { key: 'haus.turn.first_stream_ms', value: { stringValue: 'secret' } },
        { key: 'haus.turn.last_send_ms', value: { doubleValue: -1 } },
        { key: 'haus.turn.after_last_send_ms', value: { doubleValue: 604_800_001 } },
        { key: 'haus.tokens.cache_read', value: { doubleValue: 1.5 } },
        { key: 'haus.tokens.cache_write', value: { stringValue: 'secret' } },
        { key: 'haus.turn.arbitrary', value: { stringValue: 'secret' } },
    ];
    const payload = codec
        .encode(
            codec.fromObject({
                resourceSpans: [
                    {
                        scopeSpans: [
                            {
                                spans: [
                                    {
                                        traceId: Buffer.alloc(16, 1),
                                        spanId: Buffer.alloc(8, 2),
                                        name: 'haus.agent.turn',
                                        startTimeUnixNano: '1000000000',
                                        endTimeUnixNano: '2000000000',
                                        attributes,
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
        codec.decode(
            sanitizeComputerTelemetry(
                'traces',
                payload,
                {
                    id: 'cmp_test',
                    serverId: 'srv_test',
                    agents: [],
                },
                'production'
            )
        ),
        { longs: String }
    );
    const text = JSON.stringify(sanitized);
    expect(text).toContain('haus.reasoning.effort');
    expect(text).toContain('12.5');
    expect(text).toContain('haus.turn.first_send_ms');
    expect(text).toContain('haus.tokens.input');
    expect(text).toContain('haus.tokens.output');
    expect(text).toContain('haus.turn.sent_chats');
    for (const name of [
        'secret',
        'first_stream',
        'last_send',
        'cache_read',
        'cache_write',
        'arbitrary',
        'done_chats',
    ]) {
        expect(text).not.toContain(name);
    }
});
