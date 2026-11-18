import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * A WebSocket carries the Haus session it was opened with. The Server must
 * still judge every authenticated operation against a current token, so a
 * socket whose session has expired cannot start a new subscription.
 */
let harness: HausServerHarness;
let serverId: string;
const openClients: HausClient[] = [];

beforeAll(async () => {
    harness = await startHausServerHarness();

    const owner = await connect(await harness.humans.mintSessionToken('user_cf_freshness'));
    const created = await owner.trpc.server.create.mutate({
        displayName: 'Freshness',
        slug: 'freshness',
    });

    serverId = created.id;
});

afterAll(async () => {
    for (const client of openClients) {
        client.close();
    }

    await harness.close();
});

test('refuses a subscription on a socket whose Haus session expired', async () => {
    const stale = await connect(await harness.humans.mintExpiredSessionToken('user_cf_freshness'));

    await expect(subscribeStarted(stale)).rejects.toThrow(/sign in/i);
});

test('accepts the same subscription once the socket carries a current session', async () => {
    const refreshed = await connect(await harness.humans.mintSessionToken('user_cf_freshness'));

    await expect(subscribeStarted(refreshed)).resolves.toBeUndefined();
});

function subscribeStarted(client: HausClient) {
    const started = Promise.withResolvers<void>();
    const subscription = client.trpc.server.onUpdated.subscribe(
        { serverId },
        {
            onError: (error) => started.reject(error),
            onStarted: () => {
                subscription.unsubscribe();
                started.resolve();
            },
        }
    );

    return started.promise;
}

async function connect(sessionToken: string) {
    const client = createHausClient(harness, sessionToken);

    openClients.push(client);
    return client;
}
