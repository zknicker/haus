'use strict';

const {
    authorizationLocation,
    readTokenReply,
    validateAuthConfig,
    validateOAuthMetadata,
} = require('./native-oauth.cjs');

const sessionRequestHeader = 'X-Haus-Session-Request';

function createNativeAuthClient({ appUrl, fetchImpl = fetch, now = Date.now }) {
    let configPromise = null;
    let metadataPromise = null;

    async function config() {
        configPromise ??= (async () => {
            const response = await fetchImpl(new URL('/auth/config', appUrl), {
                headers: { Accept: 'application/json' },
                redirect: 'manual',
            });
            if (!response.ok || response.status >= 300) {
                throw new Error('Haus could not load sign-in settings.');
            }
            return validateAuthConfig(await response.json());
        })().catch((error) => {
            configPromise = null;
            throw error;
        });
        return configPromise;
    }

    async function metadata() {
        metadataPromise ??= (async () => {
            const settings = await config();
            const discoveryUrl = new URL(
                '/.well-known/oauth-authorization-server',
                settings.issuer
            );
            const response = await fetchImpl(discoveryUrl, {
                headers: { Accept: 'application/json' },
                redirect: 'manual',
            });
            if (!response.ok || response.status >= 300) {
                throw new Error('Haus could not load provider sign-in settings.');
            }
            return {
                config: settings,
                endpoints: validateOAuthMetadata(settings, await response.json()),
            };
        })().catch((error) => {
            metadataPromise = null;
            throw error;
        });
        return metadataPromise;
    }

    async function start(redirectUri, attempt) {
        const { config: settings, endpoints } = await metadata();
        const startUrl = new URL('/auth/start', appUrl);
        startUrl.searchParams.set('client', 'desktop');
        startUrl.searchParams.set('redirectUri', redirectUri);
        startUrl.searchParams.set('state', attempt.state);
        startUrl.searchParams.set('codeChallenge', attempt.challenge);
        const response = await fetchImpl(startUrl, { redirect: 'manual' });
        const location = response.headers.get('location');
        if (!(response.status >= 300 && response.status < 400 && location)) {
            throw new Error('Haus could not start desktop sign-in.');
        }
        return {
            config: settings,
            endpoints,
            authorizationUrl: authorizationLocation(location, endpoints, settings),
        };
    }

    async function exchangeCode(auth, code) {
        const body = new URLSearchParams({
            client_id: auth.config.clientId,
            code,
            code_verifier: auth.verifier,
            grant_type: 'authorization_code',
            redirect_uri: auth.config.redirectUri,
            resource: auth.config.resource,
        });
        const tokens = readTokenReply(await tokenRequest(auth.endpoints.token, body), now);
        if (!tokens.refreshToken) {
            throw new Error('Cloudflare did not return a refresh credential.');
        }
        return tokens;
    }

    async function refreshProvider(saved) {
        const { config: settings, endpoints } = await metadata();
        if (!saved.refreshToken) {
            const error = new Error('Cloudflare sign-in expired.');
            error.oauthError = 'invalid_grant';
            throw error;
        }
        const body = new URLSearchParams({
            client_id: settings.clientId,
            grant_type: 'refresh_token',
            refresh_token: saved.refreshToken,
            resource: settings.resource,
        });
        const token = readTokenReply(await tokenRequest(endpoints.token, body), now);
        return {
            ...saved,
            ...token,
            refreshToken: token.refreshToken ?? saved.refreshToken,
        };
    }

    async function requestSession(saved) {
        const result = await post('/auth/session', {
            authorization: saved.accessToken,
            body: {
                client: 'desktop',
                ...(saved.sessionToken ? { sessionToken: saved.sessionToken } : {}),
            },
        });
        if (
            result.response.status === 401 ||
            result.response.status === 403 ||
            isRevokedAuthError(result.body)
        ) {
            return { kind: 'unauthorized' };
        }
        if (!result.response.ok) {
            throw new Error(
                `Haus could not refresh the desktop session (${result.response.status}).`
            );
        }
        return { kind: 'session', value: parseNativeSession(result.body, now()) };
    }

    async function developmentSession(sessionToken) {
        const result = await post('/auth/dev/session', {
            body: { client: 'desktop', ...(sessionToken ? { sessionToken } : {}) },
        });
        if (!result.response.ok) {
            throw new Error(
                `Haus could not refresh the desktop session (${result.response.status}).`
            );
        }
        return parseNativeSession(result.body, now());
    }

    async function signOut(saved) {
        if (saved?.sessionToken) {
            await post('/auth/logout', {
                authorization: saved.accessToken,
                body: { client: 'desktop', sessionToken: saved.sessionToken },
            }).catch(() => undefined);
        }
        if (saved?.refreshToken) {
            await revokeGrant(saved.refreshToken).catch(() => undefined);
        }
    }

    async function revokeGrant(refreshToken) {
        const { config: settings, endpoints } = await metadata();
        if (!endpoints.revoke) {
            return;
        }
        const body = new URLSearchParams({
            client_id: settings.clientId,
            token: refreshToken,
            token_type_hint: 'refresh_token',
        });
        await fetchImpl(endpoints.revoke, {
            body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            redirect: 'manual',
        });
    }

    async function post(pathname, { authorization, body }) {
        const response = await fetchImpl(new URL(pathname, appUrl), {
            body: JSON.stringify(body),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
                [sessionRequestHeader]: '1',
            },
            method: 'POST',
            redirect: 'manual',
        });
        return { body: await response.json().catch(() => null), response };
    }

    async function tokenRequest(endpoint, body) {
        const response = await fetchImpl(endpoint, {
            body,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            redirect: 'manual',
        });
        const value = await response.json().catch(() => null);
        if (!response.ok || response.status >= 300) {
            const error = new Error('Cloudflare could not refresh sign-in.');
            error.oauthError = value?.error;
            throw error;
        }
        return value;
    }

    return {
        developmentSession,
        exchangeCode,
        metadata,
        refreshProvider,
        requestSession,
        signOut,
        start,
    };
}

function parseNativeSession(value, now = Date.now()) {
    const session = value?.session;
    const user = session?.user;
    const expiresAt = Date.parse(session?.expiresAt);
    const sessionExpiresAt = Date.parse(value?.sessionExpiresAt);
    if (
        !session ||
        typeof session.accessToken !== 'string' ||
        !Number.isFinite(Date.parse(session.issuedAt)) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now ||
        typeof session.sessionId !== 'string' ||
        !user ||
        typeof user.id !== 'string' ||
        ['avatarId', 'displayName', 'email'].some(
            (key) => user[key] !== null && typeof user[key] !== 'string'
        ) ||
        typeof value.sessionExpiresAt !== 'string' ||
        !Number.isFinite(sessionExpiresAt) ||
        sessionExpiresAt <= now ||
        typeof value.sessionToken !== 'string' ||
        !value.sessionToken
    ) {
        throw new Error('Haus Server returned an invalid desktop session.');
    }
    return { session, sessionExpiresAt: value.sessionExpiresAt, sessionToken: value.sessionToken };
}

function isRevokedAuthError(value) {
    return ['auth_expired', 'auth_invalid_grant', 'auth_required', 'auth_revoked'].includes(
        value?.error
    );
}

module.exports = { createNativeAuthClient, isRevokedAuthError, parseNativeSession };
