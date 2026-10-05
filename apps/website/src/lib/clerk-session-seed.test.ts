import { describe, expect, test } from 'bun:test';
import {
    clerkSeedInitialState,
    isUsableSeed,
    parseClerkSessionSeed,
} from './clerk-session-seed.ts';

function jwt(claims: Record<string, unknown>) {
    const part = (value: unknown) =>
        btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

const now = 1_000_000;
const token = jwt({ exp: 1060, sid: 'sess_1', sub: 'user_1' });

describe('parseClerkSessionSeed', () => {
    test('reads the session and user from a live session token', () => {
        const seed = parseClerkSessionSeed(token, now);
        expect(seed).toMatchObject({
            expiresAt: 1_060_000,
            sessionId: 'sess_1',
            token,
            userId: 'user_1',
        });
        expect(seed && clerkSeedInitialState(seed)).toMatchObject({
            sessionId: 'sess_1',
            sessionStatus: 'active',
            userId: 'user_1',
        });
    });

    test('refuses anything that is not a live, active session token', () => {
        expect(parseClerkSessionSeed(null, now)).toBeNull();
        expect(parseClerkSessionSeed('nope', now)).toBeNull();
        expect(parseClerkSessionSeed(jwt({ exp: 1060, sub: 'user_1' }), now)).toBeNull();
        expect(parseClerkSessionSeed(jwt({ exp: 1014, sid: 's', sub: 'u' }), now)).toBeNull();
        expect(
            parseClerkSessionSeed(jwt({ exp: 1060, sid: 's', sts: 'pending', sub: 'u' }), now)
        ).toBeNull();
    });

    test('a seed stops being usable near its expiry', () => {
        const seed = parseClerkSessionSeed(token, now);
        expect(isUsableSeed(seed, now)).toBe(true);
        expect(isUsableSeed(seed, 1_045_000)).toBe(true);
        expect(isUsableSeed(seed, 1_045_001)).toBe(false);
        expect(isUsableSeed(null, now)).toBe(false);
    });
});
