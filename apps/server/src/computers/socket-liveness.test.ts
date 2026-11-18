import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { defaultComputerSocketLiveness, watchComputerSocketLiveness } from './socket-liveness.ts';

// The App no longer probes Computers on focus, so this routine timeout is the
// whole offline-detection contract: a silent Computer reads offline within
// timeoutMs + intervalMs of its last frame, and an answering one never does.
const { intervalMs, timeoutMs } = defaultComputerSocketLiveness;

beforeEach(() => {
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

test('routine liveness reaps a silent Computer within 40 seconds', () => {
    expect(defaultComputerSocketLiveness).toEqual({
        intervalMs: 10_000,
        probeTimeoutMs: 3000,
        timeoutMs: 30_000,
    });
    expect(timeoutMs + intervalMs).toBeLessThanOrEqual(40_000);
});

test('a silent socket is reaped after the timeout and not before', () => {
    const socket = fakeSocket({ answersPings: false });
    let reapedAt: number | null = null;
    const startedAt = Date.now();
    const liveness = watchComputerSocketLiveness(
        socket.asWebSocket(),
        defaultComputerSocketLiveness,
        () => {
            reapedAt = Date.now() - startedAt;
        }
    );

    jest.advanceTimersByTime(timeoutMs - 1);
    expect(reapedAt).toBeNull();
    expect(socket.pings).toBeGreaterThan(0);
    jest.advanceTimersByTime(intervalMs + 1);
    expect(reapedAt).not.toBeNull();
    expect(reapedAt ?? 0).toBeGreaterThanOrEqual(timeoutMs);
    expect(reapedAt ?? 0).toBeLessThanOrEqual(timeoutMs + intervalMs);
    liveness.stop();
});

test('a socket that answers pings stays attached indefinitely', () => {
    const socket = fakeSocket({ answersPings: true });
    let reaped = false;
    const liveness = watchComputerSocketLiveness(
        socket.asWebSocket(),
        defaultComputerSocketLiveness,
        () => {
            reaped = true;
        }
    );

    jest.advanceTimersByTime(10 * 60_000);
    expect(reaped).toBeFalse();
    liveness.stop();
});

test('any inbound frame counts as alive even without pongs', () => {
    const socket = fakeSocket({ answersPings: false });
    let reaped = false;
    const liveness = watchComputerSocketLiveness(
        socket.asWebSocket(),
        defaultComputerSocketLiveness,
        () => {
            reaped = true;
        }
    );

    for (let elapsed = 0; elapsed < 5 * 60_000; elapsed += timeoutMs / 2) {
        jest.advanceTimersByTime(timeoutMs / 2);
        socket.emit('message', Buffer.from('{"type":"report"}'));
    }
    expect(reaped).toBeFalse();
    liveness.stop();
});

function fakeSocket(options: { answersPings: boolean }) {
    const emitter = new EventEmitter();
    const socket = Object.assign(emitter, {
        asWebSocket: () => socket as unknown as WebSocket,
        ping: () => {
            socket.pings += 1;
            if (options.answersPings) {
                emitter.emit('pong');
            }
        },
        pings: 0,
        readyState: WebSocket.OPEN,
    });
    return socket;
}
