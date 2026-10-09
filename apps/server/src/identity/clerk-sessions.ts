import { createRemoteJWKSet, customFetch, type FetchImplementation, jwtVerify } from 'jose';

/**
 * Verifies Clerk session tokens against the configured Clerk instance. Only the
 * token subject is read: it is the external reference used to find the Haus
 * User. Clerk Organization and Clerk role claims are never inspected because
 * they carry no Haus authority.
 */
export interface ClerkSessions {
    verify(token: string): Promise<ClerkSessionIdentity>;
}

/** What one verified token says: whose it is, which Clerk session minted it, and until when. */
export interface ClerkSessionIdentity {
    /** Clerk's `sid`; null only for a token minted without one. */
    clerkSessionId: string | null;
    clerkUserId: string;
    /** Token expiry (`exp`) in epoch milliseconds. */
    expiresAt: number;
}

/**
 * The Clerk signing keys could not be resolved in time. This is a Server
 * availability failure, not a rejected session: the token was never judged.
 */
export class ClerkSessionUnavailableError extends Error {
    constructor() {
        super('Could not reach the sign-in service. Try again.');
        this.name = 'ClerkSessionUnavailableError';
    }
}

export interface ClerkSessionOptions {
    /**
     * The outbound JWKS fetch. The Server owns this boundary so a stalled
     * signing-key fetch is reproducible in a test instead of only in production.
     */
    fetch?: FetchImplementation;
    /** The Server's own bound on resolving one token. Defaults to 7 seconds. */
    resolveDeadlineMs?: number;
}

const clockToleranceSeconds = 10;
/** What jose allows one JWKS HTTP request, matching its own documented default. */
const jwksFetchTimeoutMs = 5000;
/** The Server's bound, deliberately above jose's so its own failure surfaces first. */
const resolveDeadlineMs = 7000;

/**
 * The key set is rebuilt whenever resolving a token outruns the deadline.
 *
 * jose keeps one shared in-flight JWKS fetch per key set and refetches whenever
 * the cache ages out, so every authenticated request in the process awaits that
 * single promise. A fetch that never settles therefore never clears it, and the
 * whole authenticated surface hangs for the life of the process while
 * unauthenticated routes stay healthy and the database sits idle. Owning the
 * deadline here — and abandoning the key set that missed it — keeps that failure
 * to the requests it actually delayed.
 */
export function createClerkSessions(
    issuerUrl: string,
    appOrigin: string,
    options: ClerkSessionOptions = {}
): ClerkSessions {
    const issuer = new URL(issuerUrl);
    const jwksUrl = new URL('/.well-known/jwks.json', issuer);
    const expectedIssuer = issuer.origin;
    const expectedAuthorizedParty = new URL(appOrigin).origin;
    const deadlineMs = options.resolveDeadlineMs ?? resolveDeadlineMs;
    const createKeys = () =>
        createRemoteJWKSet(jwksUrl, {
            timeoutDuration: jwksFetchTimeoutMs,
            ...(options.fetch ? { [customFetch]: options.fetch } : {}),
        });
    let keys = createKeys();

    return {
        async verify(token) {
            const resolving = keys;
            const { payload } = await withDeadline(
                jwtVerify(token, resolving, {
                    clockTolerance: clockToleranceSeconds,
                    issuer: expectedIssuer,
                }),
                deadlineMs,
                () => {
                    if (keys === resolving) {
                        keys = createKeys();
                    }
                }
            );

            // One Clerk instance signs tokens for every frontend attached to
            // it, so the issuer alone does not say the token was minted for
            // this Server's App. `azp` is the frontend that asked for it, and
            // Clerk omits it when no browser Origin took part — as with the
            // native header-authenticated desktop session. Present means it
            // must be this App's exact origin; a null, non-string, empty, or
            // foreign value all fail that comparison.
            if (payload.azp !== undefined && payload.azp !== expectedAuthorizedParty) {
                throw new Error('Clerk session token was issued for another authorized party.');
            }

            if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
                throw new Error('Clerk session token has no subject.');
            }

            if (typeof payload.exp !== 'number') {
                throw new Error('Clerk session token has no expiry.');
            }

            return {
                clerkSessionId: typeof payload.sid === 'string' ? payload.sid : null,
                clerkUserId: payload.sub,
                expiresAt: payload.exp * 1000,
            };
        },
    };
}

async function withDeadline<T>(
    work: Promise<T>,
    deadline: number,
    onMissed: () => void
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const missed = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ClerkSessionUnavailableError()), deadline);
    });

    // The abandoned work may never settle; swallowing its rejection keeps a
    // late failure from surfacing as an unhandled rejection.
    work.catch(() => undefined);

    try {
        return await Promise.race([work, missed]);
    } catch (cause) {
        if (cause instanceof ClerkSessionUnavailableError) {
            onMissed();
        }
        throw cause;
    } finally {
        clearTimeout(timer);
    }
}
