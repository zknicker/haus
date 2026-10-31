import { describe, expect, test } from 'bun:test';
import { createHausConnection, refreshHausSession } from './haus-connection.ts';

interface Frame {
    id: number | string;
    method?: string;
    params?: { path?: string };
}

/** The socket tRPC's wsClient opens, driven by the test: it records frames and replays Server frames. */
class FakeSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static last: FakeSocket | null = null;
    binaryType = 'blob';
    readyState = FakeSocket.CONNECTING;
    readonly sent: Frame[] = [];

    constructor(readonly url: string) {
        super();
        FakeSocket.last = this;
        setTimeout(() => {
            this.readyState = FakeSocket.OPEN;
            this.dispatchEvent(new Event('open'));
        });
    }

    send(payload: string) {
        const parsed = JSON.parse(payload) as Frame | Frame[];
        this.sent.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    }

    close() {
        if (this.readyState === FakeSocket.CLOSED) {
            return;
        }
        this.readyState = FakeSocket.CLOSED;
        setTimeout(() => this.dispatchEvent(new Event('close')));
    }

    receive(frame: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
    }
}

async function until<T>(read: () => T | undefined): Promise<T> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const value = read();
        if (value !== undefined) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error('Timed out waiting for the socket.');
}

describe('Haus connection', () => {
    test('a session refresh never takes over a live subscription on the shared socket', async () => {
        FakeSocket.last = null;
        const connection = createHausConnection({
            onConnectionState: () => undefined,
            origin: 'http://localhost:1',
            productVersion: 'test',
            readAccessToken: async () => 'token-1',
            WebSocket: FakeSocket as unknown as typeof WebSocket,
        });
        const received: unknown[] = [];
        const subscription = connection.client.chat.onMessageCreated.subscribe(
            { serverId: 'srv_1' },
            { onData: (event) => received.push(event) }
        );
        const socket = await until(() => FakeSocket.last ?? undefined);
        const stream = await until(() =>
            socket.sent.find((frame) => frame.method === 'subscription')
        );
        socket.receive({ id: stream.id, result: { type: 'started' } });
        await until(() => (connection.wsClient.connection?.state === 'open' ? true : undefined));

        const refreshed = refreshHausSession(connection, 'token-2');
        const refresh = await until(() =>
            socket.sent.find((frame) => frame.params?.path === 'session.refresh')
        );
        expect(refresh.id).not.toBe(stream.id);
        socket.receive({ id: refresh.id, result: { data: { ok: true }, type: 'data' } });
        await refreshed;

        socket.receive({ id: stream.id, result: { data: { messageId: 'msg_1' }, type: 'data' } });
        expect(received).toEqual([{ messageId: 'msg_1' }]);

        subscription.unsubscribe();
        await connection.wsClient.close();
    });

    test('a socket reconnect after session refreshes resubscribes every live subscription', async () => {
        FakeSocket.last = null;
        const connection = createHausConnection({
            onConnectionState: () => undefined,
            origin: 'http://localhost:1',
            productVersion: 'test',
            readAccessToken: async () => 'token-1',
            WebSocket: FakeSocket as unknown as typeof WebSocket,
        });
        const subscriptions = [
            connection.client.server.onUpdated.subscribe({ serverId: 'srv_1' }, {}),
            connection.client.member.onUpdated.subscribe({ serverId: 'srv_1' }, {}),
        ];
        const first = await until(() => FakeSocket.last ?? undefined);
        await until(() => (connection.wsClient.connection?.state === 'open' ? true : undefined));
        for (const frame of first.sent.filter((sent) => sent.method === 'subscription')) {
            first.receive({ id: frame.id, result: { type: 'started' } });
        }
        for (const token of ['token-2', 'token-3']) {
            const refreshed = refreshHausSession(connection, token);
            const refresh = await until(() =>
                first.sent.find((frame) => frame.params?.path === 'session.refresh')
            );
            first.receive({ id: refresh.id, result: { data: { ok: true }, type: 'data' } });
            await refreshed;
            first.sent.length = 0;
        }

        first.close();
        const second = await until(() =>
            FakeSocket.last === first ? undefined : (FakeSocket.last ?? undefined)
        );
        const resent = await until(() => {
            const paths = second.sent
                .filter((frame) => frame.method === 'subscription')
                .map((frame) => frame.params?.path);
            return paths.length === 2 ? paths.sort() : undefined;
        });
        expect(resent).toEqual(['member.onUpdated', 'server.onUpdated']);

        for (const subscription of subscriptions) {
            subscription.unsubscribe();
        }
        await connection.wsClient.close();
    });
});
