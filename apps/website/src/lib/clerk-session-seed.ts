import type { ClerkProviderProps } from '@clerk/clerk-react';

type ClerkInitialState = NonNullable<ClerkProviderProps['initialState']>;

/**
 * A Clerk session token another desktop window already holds, handed to this
 * window while its own Clerk loads (docs/api/auth.md, "Desktop session
 * handoff"). Claims are read, not verified: they only decide what this window
 * renders first. The Server verifies the token on every request.
 */
export interface ClerkSessionSeed {
    claims: Record<string, unknown> & { exp: number; sid: string; sub: string };
    /** Expiry in ms. */
    expiresAt: number;
    sessionId: string;
    token: string;
    userId: string;
}

/**
 * A seed is used only while it has at least this long left, so a slow request
 * cannot reach the Server expired; the window then waits for Clerk. Main hands
 * a token out under the same rule (electron/clerk-session-handoff.cjs).
 */
export const seedExpiryMarginMs = 15_000;

export function parseClerkSessionSeed(value: unknown, now: number): ClerkSessionSeed | null {
    if (typeof value !== 'string') {
        return null;
    }
    const claims = decodeClaims(value);
    if (!(claims && claims.sts !== 'pending')) {
        return null;
    }
    const expiresAt = claims.exp * 1000;
    return expiresAt - now >= seedExpiryMarginMs
        ? { claims, expiresAt, sessionId: claims.sid, token: value, userId: claims.sub }
        : null;
}

/** A session token's expiry in ms, or null when it is not a session token. */
export function sessionTokenExpiresAt(token: string): number | null {
    const claims = decodeClaims(token);
    return claims ? claims.exp * 1000 : null;
}

export function isUsableSeed(seed: ClerkSessionSeed | null, now: number): seed is ClerkSessionSeed {
    return seed !== null && seed.expiresAt - now >= seedExpiryMarginMs;
}

/**
 * Clerk's supported pre-load auth state (`ClerkProvider initialState`, built for
 * SSR hydration): `useAuth` reports this session signed in until Clerk loads,
 * then Clerk's own client state replaces it.
 */
export function clerkSeedInitialState(seed: ClerkSessionSeed): ClerkInitialState {
    return {
        sessionClaims: seed.claims,
        sessionId: seed.sessionId,
        sessionStatus: 'active',
        userId: seed.userId,
    } as ClerkInitialState;
}

function decodeClaims(token: string): ClerkSessionSeed['claims'] | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }
    try {
        const base64 = (parts[1] ?? '').replaceAll('-', '+').replaceAll('_', '/');
        const claims: unknown = JSON.parse(
            atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
        );
        if (
            claims &&
            typeof claims === 'object' &&
            'sub' in claims &&
            typeof claims.sub === 'string' &&
            'sid' in claims &&
            typeof claims.sid === 'string' &&
            'exp' in claims &&
            typeof claims.exp === 'number' &&
            Number.isFinite(claims.exp)
        ) {
            return claims as ClerkSessionSeed['claims'];
        }
        return null;
    } catch {
        return null;
    }
}
