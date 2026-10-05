'use strict';

const { appWindowOf } = require('./trusted-renderer.cjs');

// A handed-off token must outlive the new window's first Server reads; Clerk
// session tokens live about a minute and windows refresh them well before that.
// Must match `seedExpiryMarginMs` in src/lib/clerk-session-seed.ts.
const minRemainingMs = 15_000;
const maxTokenLength = 8192;

/**
 * The Clerk session token App windows already hold, handed to a window that is
 * still booting so it can render signed in before its own Clerk loads
 * (docs/api/auth.md, "Desktop session handoff"). Memory only: never written to
 * disk, gone when the app quits. Windows share the token they read
 * (`desktop:auth:session-share`, null on sign-out); a booting window peeks it
 * synchronously (`desktop:auth:session-peek`) and gets it only while it has
 * at least `minRemainingMs` left. The Server still verifies every token.
 *
 * Shares race across windows, so main keeps the newest by `iat`: an older
 * token is ignored, and a different session must be strictly newer, so a stale
 * window still on the previous account cannot replace the current one. A
 * sign-out clear always applies and keeps the `iat` floor. A clear or a new
 * session calls `onSessionChange`, which drops data held for booting windows.
 */
function registerClerkSessionHandoff({
    appUrl,
    BrowserWindow,
    ipcMain,
    now = Date.now,
    onSessionChange = () => undefined,
}) {
    let shared = null;
    let latestIat = Number.NEGATIVE_INFINITY;
    let latestSid = null;
    const appWindow = (event) => {
        appWindowOf(event, {
            appUrl,
            BrowserWindow,
            message: 'Only the Haus App can share its session.',
        });
    };

    ipcMain.handle('desktop:auth:session-share', (event, token) => {
        appWindow(event);
        if (token === null) {
            shared = null;
            onSessionChange();
            return;
        }
        const claims = sessionTokenClaims(token);
        if (claims === null) {
            throw new Error('Invalid Clerk session token.');
        }
        const stale =
            claims.iat < latestIat || (claims.sid !== latestSid && claims.iat === latestIat);
        if (stale) {
            return;
        }
        if (claims.sid !== latestSid) {
            onSessionChange();
        }
        latestIat = claims.iat;
        latestSid = claims.sid;
        shared = { expiresAt: claims.exp * 1000, token };
    });
    // Synchronous: the booting window decides its first render from it.
    ipcMain.on('desktop:auth:session-peek', (event) => {
        let token = null;
        try {
            appWindow(event);
            if (shared && shared.expiresAt - now() >= minRemainingMs) {
                token = shared.token;
            }
        } catch {
            token = null;
        }
        event.returnValue = token;
    });
}

/** A Clerk session JWT's claims, or null when it is not one. Signatures are the Server's job. */
function sessionTokenClaims(token) {
    if (typeof token !== 'string' || token.length > maxTokenLength) {
        return null;
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }
    try {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const valid =
            claims &&
            typeof claims.sub === 'string' &&
            typeof claims.sid === 'string' &&
            Number.isFinite(claims.exp) &&
            Number.isFinite(claims.iat);
        return valid ? claims : null;
    } catch {
        return null;
    }
}

module.exports = { registerClerkSessionHandoff, sessionTokenClaims };
