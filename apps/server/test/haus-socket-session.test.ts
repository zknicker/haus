import { afterAll, beforeAll, expect, test } from 'bun:test';
import { appProtocolVersion } from '@haus/api';
import { createTRPCClient, createWSClient, TRPCClientError, wsLink } from '@trpc/client';
import type { HausRouter } from '../src/haus-api/router.ts';
import { socketSessionExpiredCloseCode } from '../src/haus-api/socket-session.ts';
import { createHausClient, createOriginWebSocket, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Clerk rotates session tokens every minute. The App hands each rotation to its
 * open WebSocket (`session.refresh`) instead of reconnecting, so the Server must
 * keep that socket bound to one Clerk user and session, judge new operations
 * against the newest token, and close a socket whose session lapses.
 */
let harness: HausServerHarness;
let serverId: string;
const owner = 'user_clerk_socket_owner';
const ownerSession = { sid: 'sess_owner' };
const sockets: SocketClient[] = [];
const httpClients: HausClient[] = [];

beforeAll(async () => {
    harness = await startHausServerHarness({ socketSessionGraceMs: 0 });
    const client = createHausClient(
        harness,
        await harness.clerk.mintSessionToken(owner, ownerSession)
    );
    httpClients.push(client);
    serverId = (await client.trpc.server.create.mutate({ displayName: 'Socket', slug: 'socket' }))
        .id;
});

afterAll(async () => {
    for (const socket of sockets) {
        socket.close();
    }
    for (const client of httpClients) {
        client.close();
    }
    await harness.close();
});

test('a rotated token for the same session replaces the old one in place', async () => {
    // Expires (with no grace) one second from now: the socket would close then.
    const socket = openSocket(await harness.clerk.mintSessionToken(owner, ownerSession, 1));
    await subscribeStarted(socket);

    await expect(
        socket.trpc.session.refresh.mutate({
            clerkSessionToken: await harness.clerk.mintSessionToken(owner, ownerSession),
        })
    ).resolves.toEqual({ ok: true });

    await Bun.sleep(1500);
    expect(socket.closeCodes).toEqual([]);
    await expect(subscribeStarted(socket)).resolves.toBeUndefined();
    expect(socket.opens).toBe(1);
});

test('a token for another user never replaces the socket session', async () => {
    const socket = openSocket(await harness.clerk.mintSessionToken(owner, ownerSession, 1));
    await subscribeStarted(socket);

    await expect(
        socket.trpc.session.refresh.mutate({
            clerkSessionToken: await harness.clerk.mintSessionToken('user_clerk_intruder', {
                sid: 'sess_intruder',
            }),
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

    // The intruder's token was refused, so the owner's lapsing session still closes the socket.
    expect(await socket.nextClose()).toBe(socketSessionExpiredCloseCode);
});

test('a token from another Clerk session of the same user is refused too', async () => {
    const socket = openSocket(await harness.clerk.mintSessionToken(owner, ownerSession));
    await subscribeStarted(socket);

    await expect(
        socket.trpc.session.refresh.mutate({
            clerkSessionToken: await harness.clerk.mintSessionToken(owner, { sid: 'sess_other' }),
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
});

test('an expired token is refused', async () => {
    const socket = openSocket(await harness.clerk.mintSessionToken(owner, ownerSession));
    await subscribeStarted(socket);

    const refused = await socket.trpc.session.refresh
        .mutate({ clerkSessionToken: await harness.clerk.mintExpiredSessionToken(owner) })
        .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(TRPCClientError);
    expect((refused as TRPCClientError<HausRouter>).data?.code).toBe('UNAUTHORIZED');
});

test('a socket whose session lapses unrefreshed is closed', async () => {
    const socket = openSocket(await harness.clerk.mintSessionToken(owner, ownerSession, 1));
    await subscribeStarted(socket);

    expect(await socket.nextClose()).toBe(socketSessionExpiredCloseCode);
});

test('a socket with no verified session has nothing to refresh', async () => {
    const socket = openSocket(null);

    await expect(
        socket.trpc.session.refresh.mutate({
            clerkSessionToken: await harness.clerk.mintSessionToken(owner, ownerSession),
        })
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } });
});

test('refresh is refused over HTTP', async () => {
    const client = createHausClient(
        harness,
        await harness.clerk.mintSessionToken(owner, ownerSession)
    );
    httpClients.push(client);

    await expect(
        client.trpc.session.refresh.mutate({
            clerkSessionToken: await harness.clerk.mintSessionToken(owner, ownerSession),
        })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
});

interface SocketClient {
    close(): void;
    closeCodes: number[];
    nextClose(): Promise<number>;
    opens: number;
    trpc: ReturnType<typeof createTRPCClient<HausRouter>>;
}

/** The App's socket alone: every operation, mutations included, rides the WebSocket. */
function openSocket(clerkSessionToken: string | null): SocketClient {
    const closeWaiters: ((code: number) => void)[] = [];
    const client: SocketClient = {
        close: () => {
            void wsClient.close();
        },
        closeCodes: [],
        nextClose: () => new Promise((resolve) => closeWaiters.push(resolve)),
        opens: 0,
        trpc: undefined as unknown as SocketClient['trpc'],
    };
    const wsClient = createWSClient({
        WebSocket: createOriginWebSocket(harness.appOrigin),
        connectionParams: () => ({
            appProtocolVersion: String(appProtocolVersion),
            ...(clerkSessionToken ? { clerkSessionToken } : {}),
            productVersion: 'test',
        }),
        onClose: (event) => {
            const code = event?.code ?? 0;
            client.closeCodes.push(code);
            for (const resolve of closeWaiters.splice(0)) {
                resolve(code);
            }
        },
        onOpen: () => {
            client.opens += 1;
        },
        url: new URL('/trpc', harness.url.toString().replace(/^http/u, 'ws')).toString(),
    });
    client.trpc = createTRPCClient<HausRouter>({ links: [wsLink({ client: wsClient })] });
    sockets.push(client);
    return client;
}

/** Starts and stops one authenticated subscription; the first one binds the socket. */
function subscribeStarted(client: SocketClient) {
    const started = Promise.withResolvers<void>();
    const subscription = client.trpc.server.onUpdate.subscribe(
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
