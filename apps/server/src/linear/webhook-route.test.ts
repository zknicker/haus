import { afterAll, beforeAll, expect, test } from 'bun:test';
import Fastify, { type FastifyInstance } from 'fastify';
import type { LinearVerifiedDelivery } from './delivery-ingest.ts';
import { type LinearIdentityReceiver, registerLinearWebhookRoutes } from './webhook-route.ts';
import { signLinearPayload } from './webhook-signature.ts';

// The endpoint contract (specs/linear-app.md#endpoints) against a stand-in
// ingest: answer order, uniform refusals, receiver binding, body limit.

const now = new Date('2026-10-15T12:00:00.000Z');
const appSecret = 'app-secret';
const identityId = 'lni_aaaaaaaaaaaaaaaa';
const identity: LinearIdentityReceiver = {
    appUserId: 'user-juniper',
    identityId,
    oauthClientId: 'client-juniper',
    organizationId: 'org-1',
    secrets: ['identity-secret'],
};
const ingested: LinearVerifiedDelivery[] = [];
const seen = new Set<string>();
let configured = true;
let app: FastifyInstance;

beforeAll(async () => {
    app = Fastify();
    await registerLinearWebhookRoutes(app, {
        clock: { now: () => now },
        ingest: (delivery) => {
            ingested.push(delivery);
            const key = `${delivery.receiver}:${delivery.deliveryId}`;
            const duplicate = seen.has(key);
            seen.add(key);
            return Promise.resolve(
                duplicate
                    ? { kind: 'duplicate', receiverKind: 'app' }
                    : { kind: 'accepted', queued: true, receiverKind: 'app' }
            );
        },
        receivers: {
            appSecrets: () => (configured ? [appSecret] : null),
            identity: (id) => Promise.resolve(id === identityId ? identity : null),
        },
    });
});

afterAll(async () => {
    await app.close();
});

function payload(overrides: Record<string, unknown> = {}) {
    return {
        action: 'update',
        organizationId: 'org-1',
        type: 'Issue',
        webhookTimestamp: now.getTime(),
        ...overrides,
    };
}

/** The header Linear sends: the body's own `type`, or Issue for bodies without one. */
function signedType(body: string): string {
    const parsed = JSON.parse(body) as { type?: unknown };
    return typeof parsed.type === 'string' ? parsed.type : 'Issue';
}

async function post(input: {
    body?: string;
    delivery?: string;
    event?: string;
    path?: string;
    secret?: string;
    signature?: string | null;
}) {
    const body = input.body ?? JSON.stringify(payload());
    const signature =
        input.signature === undefined
            ? signLinearPayload(input.secret ?? appSecret, body)
            : input.signature;
    const response = await app.inject({
        body,
        headers: {
            'content-type': 'application/json',
            'linear-delivery': input.delivery ?? crypto.randomUUID(),
            'linear-event': input.event ?? signedType(body),
            ...(signature === null ? {} : { 'linear-signature': signature }),
        },
        method: 'POST',
        url: input.path ?? '/api/linear/webhook',
    });
    return { body: response.json() as unknown, status: response.statusCode };
}

test('an unconfigured Haus app answers 503 before reading anything', async () => {
    configured = false;
    expect(await post({ signature: null })).toEqual({
        body: { code: 'linear_app_unconfigured' },
        status: 503,
    });
    configured = true;
});

test('missing or malformed headers answer 400', async () => {
    expect(await post({ signature: null })).toEqual({
        body: { code: 'invalid_linear_headers' },
        status: 400,
    });
    expect(await post({ delivery: 'bad id with spaces' })).toEqual({
        body: { code: 'invalid_linear_headers' },
        status: 400,
    });
});

test('a Linear-Event header that disagrees with the signed type answers 400 and ingests nothing', async () => {
    const before = ingested.length;
    for (const type of ['AgentSessionEvent', undefined]) {
        const body = JSON.stringify(payload({ type }));
        expect(await post({ body, event: 'Issue' })).toEqual({
            body: { code: 'invalid_linear_headers' },
            status: 400,
        });
    }
    expect(ingested).toHaveLength(before);
});

test('a body over 1 MiB answers 413', async () => {
    const body = JSON.stringify(payload({ padding: 'x'.repeat(1024 * 1024) }));
    expect(await post({ body })).toEqual({ body: { code: 'payload_too_large' }, status: 413 });
});

test('a wrong signature, a stale or future timestamp answer the same 401', async () => {
    const refused = { body: { code: 'invalid_signature' }, status: 401 };
    expect(await post({ secret: 'wrong' })).toEqual(refused);
    expect(
        await post({ body: JSON.stringify(payload({ webhookTimestamp: now.getTime() - 61_000 })) })
    ).toEqual(refused);
    expect(
        await post({ body: JSON.stringify(payload({ webhookTimestamp: now.getTime() + 61_000 })) })
    ).toEqual(refused);
});

test('a signed body that is not a JSON object answers 415', async () => {
    expect(await post({ body: '[1,2]' })).toEqual({
        body: { code: 'unsupported_media_type' },
        status: 415,
    });
});

test('a fresh signed delivery is ingested once and its retry is a duplicate', async () => {
    const delivery = crypto.randomUUID();
    expect(await post({ delivery })).toEqual({ body: { accepted: true }, status: 200 });
    expect(await post({ delivery })).toEqual({ body: { duplicate: true }, status: 200 });
    const last = ingested.at(-1);
    expect(last).toMatchObject({ deliveryId: delivery, event: 'Issue', receiver: 'app' });
    expect(last?.webhookTimestamp).toEqual(now);
});

test('an identity URL binds the payload to its organization, client, and app user', async () => {
    const path = `/api/linear/webhook/${identityId}`;
    const sessionPayload = (overrides: Record<string, unknown> = {}) =>
        JSON.stringify(
            payload({
                appUserId: 'user-juniper',
                oauthClientId: 'client-juniper',
                type: 'AgentSessionEvent',
                ...overrides,
            })
        );
    const secret = 'identity-secret';
    expect(await post({ body: sessionPayload(), path, secret })).toEqual({
        body: { accepted: true },
        status: 200,
    });
    expect(ingested.at(-1)?.receiver).toBe(identityId);
    const refused = { body: { code: 'invalid_signature' }, status: 401 };
    for (const mismatch of [
        { organizationId: 'org-2' },
        { oauthClientId: 'client-other' },
        { appUserId: 'user-other' },
        { oauthClientId: undefined },
    ]) {
        expect(await post({ body: sessionPayload(mismatch), path, secret })).toEqual(refused);
    }
    // The Haus app's secret never verifies an identity URL.
    expect(await post({ body: sessionPayload(), path })).toEqual(refused);
});

test('unknown and malformed identity ids look exactly like a bad signature', async () => {
    const refused = { body: { code: 'invalid_signature' }, status: 401 };
    expect(
        await post({ path: '/api/linear/webhook/lni_bbbbbbbbbbbbbbbb', secret: 'identity-secret' })
    ).toEqual(refused);
    expect(
        await post({ path: '/api/linear/webhook/not-an-id', secret: 'identity-secret' })
    ).toEqual(refused);
});
