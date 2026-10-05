import { seedExpiryMarginMs, sessionTokenExpiresAt } from './clerk-session-seed.ts';

/**
 * A window refreshes its shared token this long before expiry, so main always
 * holds one a booting window can still use (docs/api/auth.md, "Desktop session
 * handoff"). Native Clerk runs no token poller; without this, the shared token
 * falls under the handoff margin until the next unrelated read mints a new one.
 */
export const shareRefreshLeadMs = seedExpiryMarginMs + 10_000;

/** clerk-js reuses a cached token until it has under `leeway + 5` seconds left. */
export const shareRefreshLeewaySeconds = shareRefreshLeadMs / 1000;

interface SessionShareOptions {
    clearTimer?: (handle: unknown) => void;
    now?: () => number;
    /** Hands the token to main (`desktop:auth:session-share`). */
    publish: (token: string | null) => Promise<void>;
    /** Reads a token with `shareRefreshLeewaySeconds`; the read shares it back. */
    refresh: () => void;
    setTimer?: (run: () => void, ms: number) => unknown;
}

export interface SessionShare {
    share(token: string | null): void;
}

/** One window's side of the handoff: share each new token, refresh before it lapses. */
export function createSessionShare({
    publish,
    refresh,
    now = Date.now,
    setTimer = (run, ms) => setTimeout(run, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: SessionShareOptions): SessionShare {
    let shared: string | null | undefined;
    let timer: unknown;
    return {
        share(token) {
            if (token === shared) {
                return;
            }
            shared = token;
            if (timer !== undefined) {
                clearTimer(timer);
                timer = undefined;
            }
            const expiresAt = token === null ? null : sessionTokenExpiresAt(token);
            if (expiresAt !== null) {
                timer = setTimer(refresh, Math.max(0, expiresAt - shareRefreshLeadMs - now()));
            }
            publish(token).catch((error: unknown) => {
                shared = undefined;
                console.warn('[Clerk] Could not share the desktop session.', error);
            });
        },
    };
}
