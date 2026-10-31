'use strict';

const { createNativeAuthClient } = require('./native-auth-client.cjs');
const { createNativeAuthFlow, emptyCredentials } = require('./native-auth-flow.cjs');
const { createNativeLoopbackCallback } = require('./native-loopback-callback.cjs');

const refreshLeadMs = 25_000;

function createNativeAuthManager({
    appUrl,
    fetchImpl = fetch,
    isPackaged,
    now = Date.now,
    onSessionChange = () => {},
    onSession = () => {},
    openExternal,
    store,
    timers = { clearTimeout, setTimeout },
}) {
    let session = null;
    let credentials = null;
    let credentialsLoaded = false;
    let generation = 0;
    let refreshInFlight = null;
    let signingOut = false;
    let refreshTimer = null;
    const devFixture = isDevelopmentLoopback(appUrl, isPackaged);
    const client = createNativeAuthClient({ appUrl, fetchImpl, now });
    let flow;
    const loopback = createNativeLoopbackCallback((url) => void flow?.acceptCallback(url));

    const publish = (next) => {
        const previous = session;
        session = next;
        if (!(next && previous) || previous.user.id !== next.user.id) {
            onSessionChange();
        }
        onSession(next);
        if (next) {
            scheduleRefresh(next);
        } else if (refreshTimer) {
            timers.clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        return next;
    };

    const readCredentials = () => {
        if (!credentialsLoaded) {
            credentials = store.read();
            credentialsLoaded = true;
        }
        return credentials ? { ...credentials } : null;
    };

    const writeCredentials = (next) => {
        store.write(next);
        credentials = { ...next };
        credentialsLoaded = true;
    };

    const clearCredentials = () => {
        credentials = null;
        credentialsLoaded = true;
        store.clear();
    };

    const invalidate = () => ++generation;
    const isCurrent = (value) => value === generation;

    flow = createNativeAuthFlow({
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
        onSigningOut: (active) => {
            signingOut = active;
        },
    });

    function initialize() {
        return refresh();
    }

    function refresh() {
        if (signingOut) {
            return Promise.resolve(null);
        }
        if (refreshInFlight?.generation === generation) {
            return refreshInFlight.promise;
        }
        const requestGeneration = generation;
        const promise = refreshSession(requestGeneration).finally(() => {
            if (refreshInFlight?.promise === promise) {
                refreshInFlight = null;
            }
        });
        refreshInFlight = { generation: requestGeneration, promise };
        return promise;
    }

    async function refreshSession(requestGeneration) {
        if (devFixture) {
            return refreshDevelopmentSession(requestGeneration);
        }

        let saved = readCredentials();
        if (!(saved?.accessToken || saved?.refreshToken)) {
            if (isCurrent(requestGeneration)) {
                publish(null);
            }
            return null;
        }
        saved = await refreshProviderIfNeeded(saved, requestGeneration);
        if (!(saved && isCurrent(requestGeneration))) {
            return null;
        }
        return resumeSession(saved, requestGeneration);
    }

    async function refreshDevelopmentSession(requestGeneration) {
        const current = readCredentials();
        const result = await client.developmentSession(current?.sessionToken);
        if (!isCurrent(requestGeneration)) {
            return null;
        }
        writeCredentials(emptyCredentials({ sessionToken: result.sessionToken }));
        return publish(result.session);
    }

    async function resumeSession(credentials, requestGeneration) {
        let saved = credentials;
        let result = await client.requestSession(saved);
        if (result.kind === 'unauthorized' && saved.refreshToken) {
            saved = await refreshProvider(saved, requestGeneration);
            if (!(saved && isCurrent(requestGeneration))) {
                return null;
            }
            result = await client.requestSession(saved);
        }
        if (!isCurrent(requestGeneration)) {
            return null;
        }
        if (result.kind === 'unauthorized') {
            clearCredentials();
            return publish(null);
        }
        writeCredentials({ ...saved, sessionToken: result.value.sessionToken });
        return publish(result.value.session);
    }

    async function refreshProviderIfNeeded(saved, requestGeneration) {
        if (saved.accessToken && saved.accessExpiresAt > now() + refreshLeadMs) {
            return saved;
        }
        return refreshProvider(saved, requestGeneration);
    }

    async function refreshProvider(saved, requestGeneration) {
        try {
            const next = await client.refreshProvider(saved);
            if (!isCurrent(requestGeneration)) {
                return null;
            }
            writeCredentials(next);
            return next;
        } catch (error) {
            if (!isInvalidGrant(error)) {
                throw error;
            }
            clearCredentials();
            if (isCurrent(requestGeneration)) {
                publish(null);
            }
            return null;
        }
    }

    function scheduleRefresh(value) {
        if (refreshTimer) {
            timers.clearTimeout(refreshTimer);
        }
        const delay = Math.max(0, Date.parse(value.expiresAt) - now() - refreshLeadMs);
        refreshTimer = timers.setTimeout(() => {
            refreshTimer = null;
            void refresh().catch(() => scheduleExpiry(value));
        }, delay);
        refreshTimer?.unref?.();
    }

    function scheduleExpiry(value) {
        if (refreshTimer) {
            timers.clearTimeout(refreshTimer);
        }
        refreshTimer = timers.setTimeout(
            () => {
                refreshTimer = null;
                if (session === value && Date.parse(value.expiresAt) <= now()) {
                    publish(null);
                }
            },
            Math.max(0, Date.parse(value.expiresAt) - now())
        );
        refreshTimer?.unref?.();
    }

    return {
        acceptCallback: flow.acceptCallback,
        cancelSignIn: flow.cancelSignIn,
        currentSession: () => (session && Date.parse(session.expiresAt) > now() ? session : null),
        initialize,
        refresh,
        signIn: async (switchAccount = false) => {
            if (!devFixture) {
                return flow.signIn(switchAccount);
            }
            if (switchAccount) {
                await flow.signOut();
            } else {
                await flow.cancelSignIn();
            }
            return refresh();
        },
        signOut: flow.signOut,
    };
}

function isInvalidGrant(error) {
    return error?.oauthError === 'invalid_grant';
}

function isDevelopmentLoopback(value, isPackaged) {
    if (isPackaged) {
        return false;
    }
    try {
        const url = new URL(value);
        return (
            url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        );
    } catch {
        return false;
    }
}

module.exports = { createNativeAuthManager, isDevelopmentLoopback };
