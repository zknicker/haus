import type { ClerkSessionIdentity } from '../identity/clerk-sessions.ts';

/** Close code a Server WebSocket carries when its Clerk session lapsed unrefreshed. */
export const socketSessionExpiredCloseCode = 4401;

/**
 * How long past its newest token's expiry a socket stays open. Clerk rotates
 * tokens before they expire and the App pushes each rotation within seconds;
 * the grace only covers a slow push, never a session Clerk stopped renewing.
 */
export const defaultSocketSessionGraceMs = 60_000;

export interface SocketSessionTiming {
    clearTimer(handle: unknown): void;
    graceMs: number;
    now(): number;
    setTimer(run: () => void, ms: number): unknown;
}

export type SocketSessionRefreshResult = 'identity-mismatch' | 'refreshed' | 'unbound';

/**
 * The Clerk session one App WebSocket presents (docs/api/auth.md, "Socket
 * sessions"). The socket opens with a token; the first operation the Server
 * verifies binds the socket to that Clerk user and session for its whole life.
 * The App then hands each rotated token over the same socket, and every later
 * operation start is judged against the newest one. A token for another user
 * or another Clerk session never replaces it: identity changes take a new
 * socket. A socket whose newest token expires without a refresh is closed, so
 * subscriptions that started under a session cannot outlive it.
 */
export class SocketSession {
    private bound: Pick<ClerkSessionIdentity, 'clerkSessionId' | 'clerkUserId'> | null = null;
    private currentToken: string | null;
    private expiryTimer: unknown = null;
    private isClosed = false;
    private readonly close: () => void;
    private readonly timing: SocketSessionTiming;

    constructor(options: {
        close: () => void;
        openingToken: string | null;
        timing?: Partial<SocketSessionTiming>;
    }) {
        this.close = options.close;
        this.currentToken = options.openingToken;
        this.timing = {
            clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
            graceMs: defaultSocketSessionGraceMs,
            now: Date.now,
            setTimer: (run, ms) => setTimeout(run, ms),
            ...options.timing,
        };
    }

    /** The token every new operation on this socket is judged against. */
    get token(): string | null {
        return this.currentToken;
    }

    /**
     * Records a verification of `token`. The first one binds the socket's
     * identity; a verification of a token that is no longer current (a refresh
     * landed meanwhile) changes nothing.
     */
    observe(token: string, identity: ClerkSessionIdentity) {
        if (this.isClosed || token !== this.currentToken) {
            return;
        }
        if (!this.bound) {
            this.bound = {
                clerkSessionId: identity.clerkSessionId,
                clerkUserId: identity.clerkUserId,
            };
            this.armExpiry(identity.expiresAt);
        }
    }

    /** Swaps in a verified rotated token for the identity this socket is bound to. */
    refresh(token: string, identity: ClerkSessionIdentity): SocketSessionRefreshResult {
        if (!this.bound) {
            return 'unbound';
        }
        if (
            identity.clerkUserId !== this.bound.clerkUserId ||
            identity.clerkSessionId !== this.bound.clerkSessionId
        ) {
            return 'identity-mismatch';
        }
        if (!this.isClosed) {
            this.currentToken = token;
            this.armExpiry(identity.expiresAt);
        }
        return 'refreshed';
    }

    /** The socket closed; nothing more to enforce. */
    dispose() {
        this.isClosed = true;
        this.clearExpiry();
    }

    private armExpiry(expiresAt: number) {
        this.clearExpiry();
        const delay = Math.max(0, expiresAt + this.timing.graceMs - this.timing.now());
        this.expiryTimer = this.timing.setTimer(() => {
            this.expiryTimer = null;
            if (!this.isClosed) {
                this.isClosed = true;
                this.close();
            }
        }, delay);
    }

    private clearExpiry() {
        if (this.expiryTimer !== null) {
            this.timing.clearTimer(this.expiryTimer);
            this.expiryTimer = null;
        }
    }
}
