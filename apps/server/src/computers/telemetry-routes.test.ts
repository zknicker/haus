import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import { telemetryProtobuf } from './telemetry-protobuf.ts';
import { registerComputerTelemetryRoutes } from './telemetry-routes.ts';

test('authenticates, validates and stamps Computer telemetry before forwarding', async () => {
    const relayed: Uint8Array[] = [];
    const app = Fastify();
    registerComputerTelemetryRoutes(app, {
        auth: {
            kind: 'custom',
            authenticate: async (credential) => {
                if (credential !== 'computer-secret') {
                    throw new Error('rejected');
                }
                return { id: 'cmp_owned', serverId: 'srv_owned', agents: [] };
            },
        },
        environment: 'production',
        relay: {
            forward: async (_signal, payload) => {
                relayed.push(payload);
            },
        },
    });
    const headers = {
        authorization: 'Bearer computer-secret',
        'content-type': 'application/x-protobuf',
    };
    const url = '/computer/telemetry/v1/traces';
    try {
        expect(
            (await app.inject({ method: 'POST', url, headers, body: Buffer.from([1, 2, 3]) }))
                .statusCode
        ).toBe(400);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url,
                    headers,
                    body: Buffer.alloc(1024 * 1024 + 1),
                })
            ).statusCode
        ).toBe(413);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url,
                    headers: { ...headers, authorization: 'Bearer wrong' },
                    body: Buffer.alloc(0),
                })
            ).statusCode
        ).toBe(401);
        const valid = telemetryProtobuf.traces
            .encode({ resourceSpans: [{ resource: {}, scopeSpans: [] }] })
            .finish();
        expect(
            (await app.inject({ method: 'POST', url, headers, body: Buffer.from(valid) }))
                .statusCode
        ).toBe(200);
        expect(relayed).toHaveLength(1);
        const payload = relayed[0];
        if (!payload) {
            throw new Error('Missing forwarded payload.');
        }
        expect(
            JSON.stringify(
                telemetryProtobuf.traces.toObject(telemetryProtobuf.traces.decode(payload))
            )
        ).toContain('cmp_owned');
    } finally {
        await app.close();
    }
});

test('never exposes upstream errors or accepts JSON as OTLP', async () => {
    const app = Fastify();
    registerComputerTelemetryRoutes(app, {
        auth: {
            kind: 'custom',
            authenticate: async () => ({ id: 'cmp_owned', serverId: 'srv_owned', agents: [] }),
        },
        relay: {
            forward: async () => {
                throw new Error('secret upstream token');
            },
        },
    });
    try {
        const response = await app.inject({
            method: 'POST',
            url: '/computer/telemetry/v1/metrics',
            headers: { authorization: 'Bearer valid', 'content-type': 'application/x-protobuf' },
            body: Buffer.alloc(0),
        });
        expect(response.statusCode).toBe(502);
        expect(response.body).not.toContain('secret');
        const json = await app.inject({
            method: 'POST',
            url: '/computer/telemetry/v1/metrics',
            headers: { authorization: 'Bearer valid' },
            body: {},
        });
        expect(json.statusCode).toBe(415);
    } finally {
        await app.close();
    }
});
