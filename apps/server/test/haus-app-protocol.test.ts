import { afterAll, beforeAll, expect, test } from 'bun:test';
import { appProtocolHeaders, appProtocolVersion } from '@haus/api';
import { createHausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;

beforeAll(async () => {
    harness = await startHausServerHarness();
});

afterAll(async () => {
    await harness.close();
});

async function request(protocolVersion: number | null) {
    const headers: Record<string, string> = {
        [appProtocolHeaders.productVersion]: '1.6.3',
    };
    if (protocolVersion !== null) {
        headers[appProtocolHeaders.protocolVersion] = String(protocolVersion);
    }
    return fetch(new URL('/trpc/server.list', harness.url), { headers });
}

test('admits only the exact App protocol before a Server procedure runs', async () => {
    expect((await request(appProtocolVersion)).status).toBe(401);

    const response = await request(appProtocolVersion + 1);
    expect(response.status).toBe(412);
    expect(await response.text()).toContain('Update required');
});

test('missing App protocol fails closed', async () => {
    expect((await request(null)).status).toBe(412);
});

test('App protocol 4 receives an update requirement', async () => {
    const response = await request(4);
    expect(response.status).toBe(412);
    expect(await response.text()).toContain('Update required');
});

test('pre-unread-Inbox App protocol 7 receives an update requirement', async () => {
    const response = await request(7);
    expect(response.status).toBe(412);
    expect(await response.text()).toContain('Update required');
});

test('development mode still requires a Clerk session', async () => {
    const previous = process.env.HAUS_DEV_STACK;
    process.env.HAUS_DEV_STACK = '1';

    try {
        expect((await request(appProtocolVersion)).status).toBe(401);
    } finally {
        if (previous === undefined) {
            process.env.HAUS_DEV_STACK = undefined;
        } else {
            process.env.HAUS_DEV_STACK = previous;
        }
    }
});

// The App runs subscriptions over the tRPC WebSocket, where the version arrives
// in connectionParams. The same exact-equality gate must fail closed there
// before any subscription is served.
test('the WebSocket gate rejects a stale subscription before serving it', async () => {
    const client = createHausClient(harness, null, {
        protocolVersion: appProtocolVersion + 1,
    });

    try {
        await expect(startServerSubscription(client)).rejects.toThrow(/update required/i);
    } finally {
        client.close();
    }
});

test('the WebSocket gate admits the exact App protocol, then runs auth', async () => {
    const client = createHausClient(harness, null);

    try {
        // The gate passes, so the very next check — the Clerk session — is what
        // refuses this unauthenticated subscription. A stale client never gets here.
        await expect(startServerSubscription(client)).rejects.toThrow(/sign in/i);
    } finally {
        client.close();
    }
});

const subscriptionTimeoutMs = 5000;

function startServerSubscription(client: ReturnType<typeof createHausClient>) {
    const started = Promise.withResolvers<void>();
    const timeout = setTimeout(() => {
        started.reject(new Error('Timed out waiting for the subscription to start.'));
    }, subscriptionTimeoutMs);
    const subscription = client.trpc.server.onUpdate.subscribe(
        { serverId: '00000000-0000-4000-8000-000000000000' },
        {
            onError: (error) => {
                clearTimeout(timeout);
                subscription.unsubscribe();
                started.reject(error);
            },
            onStarted: () => {
                clearTimeout(timeout);
                subscription.unsubscribe();
                started.resolve();
            },
        }
    );

    return started.promise;
}
