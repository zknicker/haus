import type { AppSession } from '@haus/api/app-session';

export type AppAuthSnapshot =
    | { kind: 'loading' | 'signed-out'; session: null }
    | { kind: 'failed'; message: string; session: null }
    | { kind: 'ready'; session: AppSession };

export const appSessionRefreshLeadMs = 25_000;
const devSignOutStorageKey = 'haus.dev-auth.signed-out';

interface DevSignOutStorage {
    getItem: (key: string) => string | null;
    removeItem: (key: string) => void;
    setItem: (key: string, value: string) => void;
}

export function createDevSignOutPreference(getStorage: () => DevSignOutStorage) {
    let signedOutInMemory = false;
    let memoryOnly = false;

    return {
        isSignedOut: () => {
            if (memoryOnly) {
                return signedOutInMemory;
            }
            try {
                signedOutInMemory = getStorage().getItem(devSignOutStorageKey) === 'true';
                return signedOutInMemory;
            } catch {
                memoryOnly = true;
                return signedOutInMemory;
            }
        },
        setSignedOut: (signedOut: boolean) => {
            signedOutInMemory = signedOut;
            try {
                const storage = getStorage();
                if (signedOut) {
                    storage.setItem(devSignOutStorageKey, 'true');
                } else {
                    storage.removeItem(devSignOutStorageKey);
                }
                memoryOnly = false;
            } catch {
                memoryOnly = true;
                // The in-memory state still protects this page when storage is unavailable.
            }
        },
    };
}

export function sessionRefreshDelay(session: AppSession, now = Date.now()): number {
    return Math.max(0, Date.parse(session.expiresAt) - appSessionRefreshLeadMs - now);
}

export function isLoopbackHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function createAppAuthStore() {
    let snapshot: AppAuthSnapshot = { kind: 'loading', session: null };
    let generation = 0;
    const listeners = new Set<() => void>();

    const notify = () => {
        for (const listener of listeners) {
            listener();
        }
    };

    const set = (next: AppAuthSnapshot, expectedGeneration?: number): boolean => {
        if (expectedGeneration !== undefined && expectedGeneration !== generation) {
            return false;
        }

        const previousSession = snapshot.session;
        const nextSession = next.session;
        const identityChanged =
            previousSession?.user.id !== nextSession?.user.id ||
            previousSession?.sessionId !== nextSession?.sessionId;
        if (identityChanged) {
            generation += 1;
        }

        snapshot = next;
        notify();
        return true;
    };

    return {
        beginRequest: () => generation,
        clear: () => {
            generation += 1;
            set({ kind: 'signed-out', session: null });
        },
        clearIfExpired: (expiresAt: string, now = Date.now()) => {
            if (
                snapshot.kind === 'ready' &&
                snapshot.session.expiresAt === expiresAt &&
                now >= Date.parse(expiresAt)
            ) {
                set({
                    kind: 'failed',
                    message: 'Your sign-in session expired. Please try again.',
                    session: null,
                });
                return true;
            }
            return false;
        },
        current: () => snapshot,
        getAccessToken: () => snapshot.session?.accessToken ?? null,
        getGeneration: () => generation,
        getSession: () => snapshot.session,
        isCurrent: (requestGeneration: number) => requestGeneration === generation,
        invalidatePending: () => {
            generation += 1;
            return generation;
        },
        set,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

export const appAuthStore = createAppAuthStore();
