import { sessionTokenIdentity } from './clerk-session-seed.ts';

export interface HausSessionWatch {
    clearTimer(handle: number): void;
    intervalMs: number;
    readSessionToken(): Promise<string | null>;
    /** Opens a new socket: the human signed in, out, or as someone else. */
    reconnect(): void;
    /** Hands a rotated token to the open socket; rejects when the socket refuses it. */
    refreshSession(token: string): Promise<void>;
    startTimer(run: () => void, intervalMs: number): number;
}

/**
 * A Server WebSocket keeps the Clerk session it was opened with until the App
 * hands it a newer token (docs/api/auth.md, "Socket sessions"). Clerk rotates
 * tokens about every minute — on the desktop more often, since each window
 * refreshes its shared token early — so rotation must never reconnect: a
 * reconnect restarts every subscription and refetches their recovery reads.
 * The same human and Clerk session refresh in place; any identity change, or
 * a refresh the Server refuses, opens a new socket that re-reads its params.
 */
export function watchHausSession(watch: HausSessionWatch): () => void {
    let knownToken: string | null = null;
    let hasObserved = false;
    let isWatching = true;

    const readCurrentToken = () => {
        void watch.readSessionToken().then((token) => {
            if (!isWatching) {
                return;
            }
            // The first read is the baseline the socket opened with.
            if (!hasObserved) {
                hasObserved = true;
                knownToken = token;
                return;
            }
            if (token === knownToken) {
                return;
            }

            const isSameSession =
                token !== null &&
                knownToken !== null &&
                sessionIdentity(token) === sessionIdentity(knownToken);
            knownToken = token;

            if (!(isSameSession && token)) {
                watch.reconnect();
                return;
            }
            watch.refreshSession(token).catch(() => {
                if (isWatching) {
                    watch.reconnect();
                }
            });
        });
    };
    const handle = watch.startTimer(readCurrentToken, watch.intervalMs);
    readCurrentToken();

    return () => {
        isWatching = false;
        watch.clearTimer(handle);
    };
}

/** A token that is not a readable session token only matches itself. */
function sessionIdentity(token: string) {
    return sessionTokenIdentity(token) ?? token;
}
