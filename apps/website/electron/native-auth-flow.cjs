'use strict';

const { createPkceAttempt, readCallback } = require('./native-oauth.cjs');

function createNativeAuthFlow({
    client,
    devFixture,
    invalidate,
    isCurrent,
    isPackaged,
    loopback,
    now,
    openExternal,
    publish,
    readCredentials,
    writeCredentials,
    clearCredentials,
    onSigningOut = () => {},
}) {
    let pending = null;
    let signOutInFlight = null;

    async function signIn(switchAccount = false) {
        const signingOut = signOutInFlight;
        if (signingOut) {
            await signingOut;
        }
        if (switchAccount && !signingOut) {
            await signOut();
        } else {
            await cancelSignIn();
        }
        if (devFixture) {
            return null;
        }

        const requestGeneration = invalidate();
        try {
            const redirectUri = isPackaged ? 'haus://sso-callback' : await loopback.prepare();
            const attempt = createPkceAttempt(redirectUri, now());
            const auth = await client.start(redirectUri, attempt);
            if (!isCurrent(requestGeneration)) {
                await loopback.close();
                return;
            }
            pending = {
                attempt,
                auth: { ...auth, verifier: attempt.verifier },
                generation: requestGeneration,
            };
            await openExternal(auth.authorizationUrl);
        } catch (error) {
            if (isCurrent(requestGeneration)) {
                pending = null;
                await loopback.close();
            }
            throw error;
        }
    }

    async function acceptCallback(value) {
        const active = pending;
        if (!(active && isCurrent(active.generation))) {
            return;
        }
        const callback = readCallback(value, active.attempt.redirectUri, active.attempt.state);
        if (!callback) {
            return;
        }
        pending = null;
        await loopback.close();
        if (callback.error) {
            return;
        }
        try {
            const token = await client.exchangeCode(active.auth, callback.code);
            if (!isCurrent(active.generation)) {
                return;
            }
            const saved = emptyCredentials(token);
            writeCredentials(saved);
            const result = await client.requestSession(saved);
            if (!isCurrent(active.generation)) {
                return;
            }
            if (result.kind !== 'session') {
                clearCredentials();
                publish(null);
                return;
            }
            writeCredentials({ ...saved, sessionToken: result.value.sessionToken });
            publish(result.value.session);
        } catch {
            if (isCurrent(active.generation)) {
                clearCredentials();
                publish(null);
            }
        }
    }

    async function cancelSignIn() {
        invalidate();
        pending = null;
        await loopback.close();
    }

    function signOut() {
        if (signOutInFlight) {
            return signOutInFlight;
        }
        onSigningOut(true);
        signOutInFlight = performSignOut().finally(() => {
            signOutInFlight = null;
            onSigningOut(false);
        });
        return signOutInFlight;
    }

    async function performSignOut() {
        const old = readCredentials();
        invalidate();
        pending = null;
        await loopback.close();
        let clearError;
        try {
            clearCredentials();
        } catch (error) {
            clearError = error;
        }
        publish(null);
        await client.signOut(old);
        if (clearError) {
            throw clearError;
        }
    }

    return { acceptCallback, cancelSignIn, signIn, signOut };
}

function emptyCredentials(values = {}) {
    return {
        accessExpiresAt: null,
        accessToken: null,
        refreshToken: null,
        sessionToken: null,
        ...values,
    };
}

module.exports = { createNativeAuthFlow, emptyCredentials };
