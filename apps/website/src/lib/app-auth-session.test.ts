import { describe, expect, test } from 'bun:test';
import type { AppSession } from '@haus/api/app-session';
import {
    appSessionRefreshLeadMs,
    createAppAuthStore,
    createDevSignOutPreference,
    isLoopbackHost,
    sessionRefreshDelay,
} from './app-auth-session.ts';

const now = Date.parse('2026-10-31T12:00:00.000Z');

function session(
    userId: string,
    token: string,
    expiresAt = new Date(now + 60_000).toISOString()
): AppSession {
    return {
        accessToken: token,
        expiresAt,
        issuedAt: new Date(now).toISOString(),
        sessionId: `sid_${userId}`,
        user: {
            avatarId: null,
            displayName: userId,
            email: `${userId}@haus.test`,
            id: userId,
        },
    };
}

describe('App auth session timing', () => {
    test('refreshes once 25 seconds before the short access session expires', () => {
        expect(appSessionRefreshLeadMs).toBe(25_000);
        expect(sessionRefreshDelay(session('usr_a', 'access-a'), now)).toBe(35_000);
        expect(sessionRefreshDelay(session('usr_a', 'access-a'), now + 40_000)).toBe(0);
    });

    test('recognizes only loopback development hosts', () => {
        expect(isLoopbackHost('localhost')).toBe(true);
        expect(isLoopbackHost('127.0.0.1')).toBe(true);
        expect(isLoopbackHost('[::1]')).toBe(true);
        expect(isLoopbackHost('haus.chat')).toBe(false);
        expect(isLoopbackHost('127.0.0.2')).toBe(false);
    });
});

describe('development sign-out preference', () => {
    test('keeps explicit sign-out across reload until sign-in clears it', () => {
        const values = new Map<string, string>();
        const getStorage = () => ({
            getItem: (key: string) => values.get(key) ?? null,
            removeItem: (key: string) => values.delete(key),
            setItem: (key: string, value: string) => values.set(key, value),
        });
        const firstPage = createDevSignOutPreference(getStorage);

        firstPage.setSignedOut(true);

        const reloadedPage = createDevSignOutPreference(getStorage);
        expect(reloadedPage.isSignedOut()).toBe(true);
        reloadedPage.setSignedOut(false);
        expect(firstPage.isSignedOut()).toBe(false);
        expect(reloadedPage.isSignedOut()).toBe(false);
    });

    test('keeps explicit sign-out for this page when storage is unavailable', () => {
        const preference = createDevSignOutPreference(() => {
            throw new Error('Storage is unavailable.');
        });

        preference.setSignedOut(true);

        expect(preference.isSignedOut()).toBe(true);
    });
});

describe('App auth session store', () => {
    test('ignores a session read that finishes after logout', () => {
        const store = createAppAuthStore();
        const request = store.beginRequest();

        store.clear();

        expect(store.set({ kind: 'ready', session: session('usr_a', 'late') }, request)).toBe(
            false
        );
        expect(store.current()).toEqual({ kind: 'signed-out', session: null });
    });

    test('keeps same-user refreshes in one cache identity', () => {
        const store = createAppAuthStore();
        store.set({ kind: 'ready', session: session('usr_a', 'access-a') });
        const generation = store.getGeneration();
        const request = store.beginRequest();

        expect(store.set({ kind: 'ready', session: session('usr_a', 'access-b') }, request)).toBe(
            true
        );
        expect(store.getGeneration()).toBe(generation);
        expect(store.getAccessToken()).toBe('access-b');
    });

    test('a pending old-account refresh cannot replace a switched account', () => {
        const store = createAppAuthStore();
        store.set({ kind: 'ready', session: session('usr_a', 'access-a') });
        const staleRequest = store.beginRequest();
        store.invalidatePending();
        const switchRequest = store.beginRequest();

        store.set({ kind: 'ready', session: session('usr_b', 'access-b') }, switchRequest);

        expect(store.set({ kind: 'ready', session: session('usr_a', 'late') }, staleRequest)).toBe(
            false
        );
        expect(store.getSession()?.user.id).toBe('usr_b');
    });

    test('an old expiry callback cannot clear a rotated session', () => {
        const store = createAppAuthStore();
        const oldSession = session('usr_a', 'access-a');
        store.set({ kind: 'ready', session: oldSession });
        store.set({
            kind: 'ready',
            session: session('usr_a', 'access-b', new Date(now + 120_000).toISOString()),
        });

        expect(store.clearIfExpired(oldSession.expiresAt, now + 61_000)).toBe(false);
        expect(store.getAccessToken()).toBe('access-b');
    });
});
