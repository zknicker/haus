'use strict';

const { createNativeAuthManager } = require('./native-auth-manager.cjs');

const config = {
    clientId: 'native-client',
    issuer: 'https://access.example.test',
    redirectUri: 'https://haus.chat/auth/callback',
    resource: 'https://haus.chat/auth/session',
};
const metadata = {
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    issuer: config.issuer,
    revocation_endpoint: `${config.issuer}/oauth/revoke`,
    token_endpoint: `${config.issuer}/oauth/token`,
};

function createHarness({
    account = () => 'user-a',
    appUrl = 'https://haus.chat',
    initial = null,
    isPackaged = true,
    onRequest = async () => undefined,
} = {}) {
    const calls = [];
    const events = [];
    const writes = [];
    const order = [];
    let stored = initial ? { ...initial } : null;
    let clears = 0;
    const store = {
        clear() {
            stored = null;
            clears += 1;
            order.push({ kind: 'clear' });
        },
        read: () => (stored ? { ...stored } : null),
        write(value) {
            stored = { ...value };
            writes.push(stored);
            order.push({ kind: 'write', value: stored });
        },
    };
    const fetchImpl = async (input, init = {}) => {
        const url = new URL(input);
        calls.push({ init, url });
        order.push({ kind: 'request', path: url.pathname });
        const custom = await onRequest(url, init);
        if (custom) {
            return custom;
        }
        return defaultResponse(url, init, account);
    };
    const manager = createNativeAuthManager({
        appUrl,
        fetchImpl,
        isPackaged,
        now: () => 1000,
        onSession: (value) => events.push(value),
        openExternal: async () => undefined,
        store,
        timers: {
            clearTimeout() {},
            setTimeout(callback) {
                return { callback, unref() {} };
            },
        },
    });
    return {
        calls,
        events,
        get clears() {
            return clears;
        },
        manager,
        order,
        store,
        writes,
    };
}

function defaultResponse(url, init, account) {
    switch (url.pathname) {
        case '/auth/config':
            return json(config);
        case '/.well-known/oauth-authorization-server':
            return json(metadata);
        case '/auth/start':
            return authStartResponse(url);
        case '/oauth/token':
            return tokenResponse(init);
        case '/auth/session':
        case '/auth/dev/session':
            return json(nativeSession(account(), url.pathname));
        case '/auth/logout':
        case '/oauth/revoke':
            return json({});
        default:
            throw new Error(`Unhandled mock request ${url.pathname}`);
    }
}

function authStartResponse(url) {
    const authorize = new URL(metadata.authorization_endpoint);
    authorize.searchParams.set('client_id', config.clientId);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('redirect_uri', config.redirectUri);
    authorize.searchParams.set('resource', config.resource);
    authorize.searchParams.set('scope', 'openid email profile');
    authorize.searchParams.set('code_challenge_method', 'S256');
    authorize.searchParams.set('code_challenge', url.searchParams.get('codeChallenge'));
    authorize.searchParams.set('state', 'server-intent-state');
    return new Response(null, { headers: { Location: authorize.toString() }, status: 302 });
}

function tokenResponse(init) {
    const grantType = new URLSearchParams(init.body).get('grant_type');
    const accessToken =
        grantType === 'authorization_code' ? 'provider-access-1' : 'provider-access-2';
    const refreshToken =
        grantType === 'authorization_code' ? 'provider-refresh-1' : 'provider-refresh-2';
    if (!['authorization_code', 'refresh_token'].includes(grantType)) {
        throw new Error(`Unhandled token grant ${grantType}`);
    }
    return json({ access_token: accessToken, expires_in: 600, refresh_token: refreshToken });
}

function credentials(overrides = {}) {
    return {
        accessExpiresAt: Date.now() + 120_000,
        accessToken: 'provider-access-1',
        refreshToken: 'provider-refresh-1',
        sessionToken: 'resume-current',
        ...overrides,
    };
}

function nativeSession(user = 'user-a', path = 'session') {
    return {
        session: {
            accessToken: `haus-access-${user}`,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            issuedAt: new Date().toISOString(),
            sessionId: `sid-${user}-${path}`,
            user: {
                avatarId: null,
                displayName: user,
                email: `${user}@haus.test`,
                id: `usr_${user}`,
            },
        },
        sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        sessionToken: 'resume-next',
    };
}

function json(value, status = 200) {
    return Response.json(value, { status });
}

function deferred() {
    let resolve;
    let start;
    const promise = new Promise((done) => {
        resolve = done;
    });
    const started = new Promise((done) => {
        start = done;
    });
    return { promise, resolve, start, started };
}

async function waitFor(predicate) {
    const deadline = Date.now() + 1000;
    while (!predicate()) {
        if (Date.now() >= deadline) {
            throw new Error('Expected the asynchronous operation to start.');
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

module.exports = { config, createHarness, credentials, deferred, json, nativeSession, waitFor };
