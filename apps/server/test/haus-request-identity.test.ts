import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausContextFactory, type HausContextDependencies } from '../src/haus-api/context.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
const openClients: HausClient[] = [];

beforeAll(async () => {
    harness = await startHausServerHarness();
});

afterAll(async () => {
    for (const client of openClients) {
        client.close();
    }

    await harness.close();
});

test('Server requests keep the Haus access session on the request context', () => {
    const createContext = createHausContextFactory(unavailable<HausContextDependencies>());

    const context = createContext({
        req: { headers: { authorization: 'Bearer haus-access-token' } },
    });

    expect(context.sessionToken).toBe('haus-access-token');
});

test('concurrent humans each see only their own Servers', async () => {
    const [ada, grace] = await Promise.all([signIn('cf:ada-human'), signIn('cf:grace-human')]);

    await Promise.all([
        ada.trpc.server.create.mutate({ displayName: 'Ada HQ', slug: 'ada-hq' }),
        grace.trpc.server.create.mutate({ displayName: 'Grace HQ', slug: 'grace-hq' }),
    ]);

    const rounds = Array.from({ length: 8 }, (_, index) =>
        index % 2 === 0
            ? ada.trpc.server.list.query().then((servers) => ['ada', servers] as const)
            : grace.trpc.server.list.query().then((servers) => ['grace', servers] as const)
    );

    for (const [who, servers] of await Promise.all(rounds)) {
        expect(servers.map((server) => server.slug)).toEqual([
            who === 'ada' ? 'ada-hq' : 'grace-hq',
        ]);
    }
});

/** Building a context must read no dependency; touching one is the failure. */
function unavailable<T extends object>(subject: string): T {
    return new Proxy({} as T, {
        get() {
            throw new Error(`This test must not use ${subject}.`);
        },
    });
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    const client = createHausClient(harness, token);

    openClients.push(client);
    return client;
}
