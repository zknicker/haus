import { describe, expect, test } from 'bun:test';
import type { AppSession } from '@haus/api/app-session';
import { resolveSignInGate } from './sign-in-gate.tsx';

const session: AppSession = {
    accessToken: 'access-one',
    expiresAt: '2026-01-01T00:01:00.000Z',
    issuedAt: '2026-01-01T00:00:00.000Z',
    sessionId: 'sid-one',
    user: {
        avatarId: null,
        displayName: 'Ada',
        email: 'ada@haus.test',
        id: 'usr_ada',
    },
};

describe('sign-in gate', () => {
    test('keeps startup loading until the app session settles', () => {
        expect(resolveSignInGate({ kind: 'loading', session: null })).toBe('loading');
    });

    test('shows recovery after a failed session read', () => {
        expect(
            resolveSignInGate({
                kind: 'failed',
                message: 'Server unavailable',
                session: null,
            })
        ).toBe('recovery');
    });

    test('shows sign in only after Haus confirms there is no session', () => {
        expect(resolveSignInGate({ kind: 'signed-out', session: null })).toBe('signed-out');
    });

    test('opens authenticated routes for a canonical user session', () => {
        expect(resolveSignInGate({ kind: 'ready', session })).toBe('authenticated');
    });
});
