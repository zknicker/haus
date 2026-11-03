import type { HausSessionIdentity } from '../identity/haus-sessions.ts';

export const socketSessionExpiredCloseCode = 4401;

export interface SocketSessionTiming {
    clearTimer(handle: unknown): void;
    now(): number;
    setTimer(run: () => void, ms: number): unknown;
}

export type SocketSessionRefreshResult = 'identity-mismatch' | 'refreshed' | 'unbound';

/** One open App socket, bound to one canonical user and Haus session. */
export class SocketSession {
    private bound: Pick<HausSessionIdentity, 'sessionId' | 'userId'> | null = null;
    private currentToken: string | null;
    private expiryTimer: unknown = null;
    private isClosed = false;
    private readonly closeSocket: () => void;
    private readonly closeListeners = new Set<() => void>();
    private readonly timing: SocketSessionTiming;

    constructor(options: {
        close: () => void;
        openingToken: string | null;
        timing?: Partial<SocketSessionTiming>;
    }) {
        this.closeSocket = options.close;
        this.currentToken = options.openingToken;
        this.timing = {
            clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
            now: Date.now,
            setTimer: (run, ms) => setTimeout(run, ms),
            ...options.timing,
        };
    }

    get userId() {
        return this.bound?.userId ?? null;
    }

    get token() {
        return this.currentToken;
    }

    observe(token: string, identity: HausSessionIdentity) {
        if (this.isClosed || token !== this.currentToken) {
            return;
        }
        if (!this.bound) {
            this.bound = { sessionId: identity.sessionId, userId: identity.userId };
            this.armExpiry(identity.accessTokenExpiresAt);
        }
    }

    refresh(token: string, identity: HausSessionIdentity): SocketSessionRefreshResult {
        if (!this.bound) {
            return 'unbound';
        }
        if (identity.userId !== this.bound.userId || identity.sessionId !== this.bound.sessionId) {
            return 'identity-mismatch';
        }
        if (!this.isClosed) {
            this.currentToken = token;
            this.armExpiry(identity.accessTokenExpiresAt);
        }
        return 'refreshed';
    }

    dispose() {
        if (this.isClosed) {
            return;
        }
        this.isClosed = true;
        this.clearExpiry();
        for (const listener of this.closeListeners) {
            listener();
        }
        this.closeListeners.clear();
    }

    close() {
        if (this.isClosed) {
            return;
        }
        this.dispose();
        this.closeSocket();
    }

    onClose(listener: () => void) {
        if (this.isClosed) {
            listener();
            return () => undefined;
        }
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }

    private armExpiry(expiresAt: number) {
        this.clearExpiry();
        const delay = Math.max(0, expiresAt - this.timing.now());
        this.expiryTimer = this.timing.setTimer(() => this.close(), delay);
    }

    private clearExpiry() {
        if (this.expiryTimer !== null) {
            this.timing.clearTimer(this.expiryTimer);
            this.expiryTimer = null;
        }
    }
}
