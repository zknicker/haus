import { describe, expect, test } from 'bun:test';
import { resolveClerkSessionToken } from '../../lib/clerk.tsx';
import {
    readClerkSessionToken,
    resolveClerkSessionGate,
    resolveClerkSessionTokenState,
    resolveClerkStatusGate,
} from './sign-in-gate.tsx';

describe('readClerkSessionToken', () => {
    test('settles token failures into the recoverable missing state', async () => {
        const state = await readClerkSessionToken(async () => {
            throw new Error('Clerk token refresh failed');
        });

        expect(state).toBe('missing');
    });

    test('distinguishes a usable signed-in token', async () => {
        expect(await readClerkSessionToken(async () => 'session-token')).toBe('ready');
        expect(await readClerkSessionToken(async () => null)).toBe('missing');
    });
});

test('a transient refresh failure does not poison the next token read', async () => {
    expect(await resolveClerkSessionToken(async () => 'session-token')).toBe('session-token');
    expect(
        await resolveClerkSessionToken(async () => {
            throw new Error('refresh failed');
        })
    ).toBeNull();
    expect(await resolveClerkSessionToken(async () => 'next-session-token')).toBe(
        'next-session-token'
    );
});

test('only a ready known Clerk identity owns authenticated Server state', () => {
    expect(
        resolveClerkSessionGate({
            isLoaded: false,
            isSignedIn: undefined,
            tokenState: 'loading',
            userId: undefined,
        })
    ).toEqual({ kind: 'loading' });
    expect(
        resolveClerkSessionGate({
            isLoaded: true,
            isSignedIn: true,
            tokenState: 'ready',
            userId: undefined,
        })
    ).toEqual({ kind: 'loading' });
    expect(
        resolveClerkSessionGate({
            isLoaded: true,
            isSignedIn: true,
            tokenState: 'ready',
            userId: 'user-a',
        })
    ).toEqual({ kind: 'authenticated', userId: 'user-a' });
    expect(
        resolveClerkSessionGate({
            isLoaded: true,
            isSignedIn: true,
            tokenState: 'ready',
            userId: 'user-b',
        })
    ).toEqual({ kind: 'authenticated', userId: 'user-b' });
});

test('token readiness belongs only to the Clerk session that produced it', () => {
    const readySessionA = { sessionId: 'session-a', state: 'ready' as const };

    expect(resolveClerkSessionTokenState(readySessionA, 'session-a')).toBe('ready');
    expect(resolveClerkSessionTokenState(readySessionA, 'session-b')).toBe('loading');
    expect(resolveClerkSessionTokenState(readySessionA, undefined)).toBe('loading');
});

test('a resolved signed-out session shows sign-in', () => {
    expect(
        resolveClerkSessionGate({
            isLoaded: true,
            isSignedIn: false,
            tokenState: 'loading',
            userId: undefined,
        })
    ).toEqual({ kind: 'signed-out' });
});

describe('resolveClerkStatusGate', () => {
    test('waits for Clerk unless a handed-off session seeds the window', () => {
        expect(resolveClerkStatusGate({ loaded: false, seeded: false, status: 'loading' })).toBe(
            'loading'
        );
        expect(resolveClerkStatusGate({ loaded: false, seeded: true, status: 'loading' })).toBe(
            'session'
        );
        expect(resolveClerkStatusGate({ loaded: true, seeded: false, status: 'ready' })).toBe(
            'session'
        );
        expect(resolveClerkStatusGate({ loaded: true, seeded: false, status: 'degraded' })).toBe(
            'session'
        );
    });

    test('a failed Clerk load signs out even a seeded window', () => {
        expect(resolveClerkStatusGate({ loaded: false, seeded: true, status: 'error' })).toBe(
            'failed'
        );
    });
});
