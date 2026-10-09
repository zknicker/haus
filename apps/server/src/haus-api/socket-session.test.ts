import { describe, expect, test } from 'bun:test';
import { SocketSession } from './socket-session.ts';

const ada = { clerkSessionId: 'sess_ada', clerkUserId: 'user_ada' };

describe('SocketSession', () => {
    test('binds on the first verification and closes when the newest token lapses', () => {
        const clock = fakeClock();
        let closes = 0;
        const session = new SocketSession({
            close: () => {
                closes += 1;
            },
            openingToken: 'token-a',
            timing: clock.timing,
        });

        session.observe('token-a', { ...ada, expiresAt: 60_000 });
        expect(session.refresh('token-b', { ...ada, expiresAt: 120_000 })).toBe('refreshed');
        expect(session.token).toBe('token-b');

        clock.advanceTo(119_999);
        expect(closes).toBe(0);
        clock.advanceTo(120_000);
        expect(closes).toBe(1);
    });

    test('a verification that finishes after a refresh changes nothing', () => {
        const clock = fakeClock();
        let closes = 0;
        const session = new SocketSession({
            close: () => {
                closes += 1;
            },
            openingToken: 'token-a',
            timing: clock.timing,
        });

        session.observe('token-a', { ...ada, expiresAt: 60_000 });
        session.refresh('token-b', { ...ada, expiresAt: 120_000 });
        // A slow operation that verified token-a must not re-arm its earlier expiry.
        session.observe('token-a', { ...ada, expiresAt: 60_000 });

        clock.advanceTo(60_000);
        expect(closes).toBe(0);
    });

    test('refuses a refresh before binding and for another identity', () => {
        const session = new SocketSession({
            close: () => undefined,
            openingToken: 'token-a',
            timing: fakeClock().timing,
        });

        expect(session.refresh('token-b', { ...ada, expiresAt: 1 })).toBe('unbound');

        session.observe('token-a', { ...ada, expiresAt: 60_000 });
        expect(
            session.refresh('token-x', {
                clerkSessionId: 'sess_grace',
                clerkUserId: 'user_grace',
                expiresAt: 120_000,
            })
        ).toBe('identity-mismatch');
        expect(
            session.refresh('token-y', { ...ada, clerkSessionId: 'sess_other', expiresAt: 1 })
        ).toBe('identity-mismatch');
        expect(session.token).toBe('token-a');
    });

    test('a closed socket stops enforcing', () => {
        const clock = fakeClock();
        let closes = 0;
        const session = new SocketSession({
            close: () => {
                closes += 1;
            },
            openingToken: 'token-a',
            timing: clock.timing,
        });

        session.observe('token-a', { ...ada, expiresAt: 60_000 });
        session.dispose();
        clock.advanceTo(60_000);
        expect(closes).toBe(0);
    });
});

function fakeClock() {
    let now = 0;
    const timers = new Map<number, { at: number; run: () => void }>();
    let nextHandle = 1;
    return {
        advanceTo(at: number) {
            now = at;
            for (const [handle, timer] of [...timers]) {
                if (timer.at <= now) {
                    timers.delete(handle);
                    timer.run();
                }
            }
        },
        timing: {
            clearTimer: (handle: unknown) => {
                timers.delete(handle as number);
            },
            graceMs: 0,
            now: () => now,
            setTimer: (run: () => void, ms: number) => {
                const handle = nextHandle++;
                timers.set(handle, { at: now + ms, run });
                return handle;
            },
        },
    };
}
