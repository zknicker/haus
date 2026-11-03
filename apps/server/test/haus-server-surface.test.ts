import { afterAll, beforeAll, expect, test } from 'bun:test';
import { appProtocolHeaders, appProtocolVersion } from '@haus/api';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * The Server exposes the Haus Server contract plus its localhost-only
 * fixed-identity dev sign-in fixture. Legacy local-owner procedures remain unreachable here.
 */
let harness: HausServerHarness;

beforeAll(async () => {
    harness = await startHausServerHarness({ enableDevelopmentAuth: true });
});

afterAll(async () => {
    await harness.close();
});

const legacyProcedures = [
    'identity.me',
    'identity.pushSessionToken',
    'identity.removeMember',
    'agentRuntime.connect',
    'skill.list',
    'model.list',
];

test('exposes no legacy local-owner procedure', async () => {
    for (const path of legacyProcedures) {
        const response = await fetch(new URL(`/trpc/${path}`, harness.url), {
            body: '{}',
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });

        expect({ path, status: response.status }).toEqual({ path, status: 404 });
        expect(await response.text()).toContain('No procedure found');
    }
});

test('dev sign-in returns a fixed Haus session only to loopback requests', async () => {
    const local = await fetch(new URL('/auth/dev/session', harness.url));
    expect(local.status).toBe(200);
    expect(await local.json()).toMatchObject({ user: { id: 'usr_dev_haus_owner' } });

    const forwardedHost = await fetch(new URL('/auth/dev/session', harness.url), {
        headers: { host: 'haus.example' },
    });
    expect(forwardedHost.status).toBe(404);

    const arbitraryIdentity = await fetch(new URL('/auth/dev/session', harness.url), {
        body: JSON.stringify({ client: 'ios', subject: 'other-human' }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(arbitraryIdentity.status).toBe(400);
    expect(await arbitraryIdentity.json()).toMatchObject({ error: 'auth_required' });
});

test('requires an opaque Haus session for the Server contract it exposes', async () => {
    const response = await fetch(new URL('/trpc/server.list', harness.url), {
        headers: {
            [appProtocolHeaders.productVersion]: 'test',
            [appProtocolHeaders.protocolVersion]: String(appProtocolVersion),
        },
    });

    expect(response.status).toBe(401);
});
