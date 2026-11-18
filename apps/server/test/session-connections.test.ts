import { expect, test } from 'bun:test';
import { type SessionConnection, SessionConnections } from '../src/identity/session-connections.ts';

test('local sign-out closes tracked WebSocket and SSE connections for one Haus session', () => {
    const connections = new SessionConnections();
    const closed = new Set<string>();
    const websocket = fakeConnection('websocket', 'has_same_session', closed);
    const sse = fakeConnection('sse', 'has_same_session', closed);
    const otherSession = fakeConnection('other-session', 'has_other_session', closed);

    connections.track(websocket);
    connections.track(sse);
    connections.track(otherSession);
    connections.revoke('has_same_session');

    expect(closed).toEqual(new Set(['websocket', 'sse']));
    connections.revoke('has_same_session');
    expect(closed).toEqual(new Set(['websocket', 'sse']));
});

test('session expiry closes its connection as soon as access expires', async () => {
    const connections = new SessionConnections();
    const closed = new Set<string>();
    const connection = fakeConnection('sse', 'has_expiring_session', closed, Date.now() + 20);

    connections.track(connection);
    await Bun.sleep(50);

    expect(closed).toEqual(new Set(['sse']));
});

test('fresh admission renews only its session connections past the old access expiry', async () => {
    const connections = new SessionConnections();
    const closed = new Set<string>();
    const startedAt = Date.now();
    const voice = fakeConnection('voice', 'has_renewed_session', closed, startedAt + 80);
    const other = fakeConnection('other', 'has_other_session', closed, startedAt + 80);

    connections.track(voice);
    connections.track(other);
    connections.renew('has_renewed_session', startedAt + 260);
    await Bun.sleep(120);

    expect(closed).toEqual(new Set(['other']));
    await Bun.sleep(180);

    expect(closed).toEqual(new Set(['other', 'voice']));
});

function fakeConnection(
    name: string,
    sessionId: string,
    closed: Set<string>,
    expiresAt = Date.now() + 60_000
): SessionConnection {
    const listeners = new Set<() => void>();
    let isClosed = false;
    return {
        close() {
            if (isClosed) {
                return;
            }
            isClosed = true;
            closed.add(name);
            for (const listener of listeners) {
                listener();
            }
        },
        expiresAt,
        key: {},
        onClose(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        sessionId,
    };
}
