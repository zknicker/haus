import { describe, expect, test } from 'bun:test';
import { watchHausSession } from './haus-session-refresh.ts';

/**
 * Clerk rotates the session token about every minute, and every desktop window
 * refreshes its shared token early. Rotation must re-authenticate the open
 * socket in place: a reconnect restarts every subscription and refetches
 * their recovery reads. Only an identity change, or a refused refresh, opens a
 * new socket.
 */
describe('watchHausSession', () => {
    test('hands each rotated token for the same session to the open socket', async () => {
        const watch = startWatch([
            token('ada', 'sess_1', 1),
            token('ada', 'sess_1', 2),
            token('ada', 'sess_1', 2),
            token('ada', 'sess_1', 3),
        ]);

        await watch.ready();
        await watch.tick();
        await watch.tick();
        await watch.tick();

        expect(watch.refreshed).toEqual([token('ada', 'sess_1', 2), token('ada', 'sess_1', 3)]);
        expect(watch.reconnects).toBe(0);
        watch.stop();
    });

    test('reconnects when the human signs in as someone else', async () => {
        const watch = startWatch([token('ada', 'sess_1', 1), token('grace', 'sess_2', 1)]);

        await watch.ready();
        await watch.tick();

        expect(watch.refreshed).toEqual([]);
        expect(watch.reconnects).toBe(1);
        watch.stop();
    });

    test('reconnects for a new Clerk session of the same human', async () => {
        const watch = startWatch([token('ada', 'sess_1', 1), token('ada', 'sess_2', 1)]);

        await watch.ready();
        await watch.tick();

        expect(watch.reconnects).toBe(1);
        watch.stop();
    });

    test('reconnects when the socket refuses a refresh', async () => {
        const watch = startWatch([token('ada', 'sess_1', 1), token('ada', 'sess_1', 2)], {
            refuse: true,
        });

        await watch.ready();
        await watch.tick();

        expect(watch.reconnects).toBe(1);
        watch.stop();
    });

    test('does not reconnect while the human is signed out', async () => {
        const watch = startWatch([null, null]);

        await watch.ready();
        await watch.tick();

        expect(watch.reconnects).toBe(0);
        watch.stop();
    });

    test('reconnects when the human signs out', async () => {
        const watch = startWatch([token('ada', 'sess_1', 1), null]);

        await watch.ready();
        await watch.tick();

        expect(watch.reconnects).toBe(1);
        watch.stop();
    });

    test('reconnects when the human signs in later', async () => {
        const watch = startWatch([null, token('ada', 'sess_1', 1)]);

        await watch.ready();
        await watch.tick();

        expect(watch.reconnects).toBe(1);
        watch.stop();
    });

    test('an unreadable token change is treated as an identity change', async () => {
        const watch = startWatch(['opaque-one', 'opaque-two']);

        await watch.ready();
        await watch.tick();

        expect(watch.reconnects).toBe(1);
        watch.stop();
    });

    test('stops watching when torn down', async () => {
        const watch = startWatch([token('ada', 'sess_1', 1), token('grace', 'sess_2', 1)]);

        await watch.ready();
        watch.stop();
        await watch.tick();

        expect(watch.reconnects).toBe(0);
        expect(watch.isTimerCleared).toBe(true);
    });
});

/** An unsigned Clerk-shaped session token; the watch reads claims, never verifies. */
function token(sub: string, sid: string, iat: number) {
    const encode = (value: object) =>
        btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    return `${encode({ alg: 'none' })}.${encode({ exp: iat + 60, iat, sid, sub })}.signature`;
}

function startWatch(tokens: (string | null)[], options: { refuse?: boolean } = {}) {
    const queue = [...tokens];
    let handler: (() => void) | null = null;
    let cleared = false;
    let reconnects = 0;
    const refreshed: string[] = [];

    const stop = watchHausSession({
        clearTimer: () => {
            cleared = true;
            handler = null;
        },
        intervalMs: 1000,
        readSessionToken: () => Promise.resolve(queue.shift() ?? null),
        reconnect: () => {
            reconnects += 1;
        },
        refreshSession: (next) => {
            refreshed.push(next);
            return options.refuse ? Promise.reject(new Error('FORBIDDEN')) : Promise.resolve();
        },
        startTimer: (run) => {
            handler = run;
            return 1;
        },
    });

    return {
        get isTimerCleared() {
            return cleared;
        },
        get reconnects() {
            return reconnects;
        },
        get refreshed() {
            return refreshed;
        },
        async ready() {
            await Bun.sleep(0);
        },
        stop,
        async tick() {
            handler?.();
            await Bun.sleep(0);
        },
    };
}
