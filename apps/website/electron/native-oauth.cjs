'use strict';

const { createHash, randomBytes } = require('node:crypto');

function createPkceAttempt(redirectUri, now = Date.now()) {
    const verifier = randomBytes(32).toString('base64url');
    return {
        createdAt: now,
        redirectUri,
        state: randomBytes(32).toString('base64url'),
        verifier,
        challenge: createHash('sha256').update(verifier).digest('base64url'),
    };
}

function validateAuthConfig(config) {
    if (
        !config ||
        typeof config.clientId !== 'string' ||
        !config.clientId ||
        typeof config.issuer !== 'string' ||
        typeof config.resource !== 'string' ||
        typeof config.redirectUri !== 'string'
    ) {
        throw new Error('Haus Server returned invalid sign-in settings.');
    }

    const issuer = new URL(config.issuer);
    const resource = new URL(config.resource);
    const redirectUri = new URL(config.redirectUri);
    if (
        issuer.protocol !== 'https:' ||
        issuer.origin !== config.issuer ||
        issuer.username ||
        issuer.password ||
        issuer.search ||
        issuer.hash ||
        issuer.pathname !== '/' ||
        resource.protocol !== 'https:' ||
        redirectUri.protocol !== 'https:'
    ) {
        throw new Error('Haus Server returned unsupported sign-in settings.');
    }
    return config;
}

function validateOAuthMetadata(config, metadata) {
    validateAuthConfig(config);
    if (!metadata || metadata.issuer !== config.issuer) {
        throw new Error('Cloudflare returned sign-in settings for an unexpected issuer.');
    }

    const issuerOrigin = new URL(config.issuer).origin;
    const endpoints = {};
    for (const key of ['authorization_endpoint', 'token_endpoint', 'revocation_endpoint']) {
        const value = metadata[key];
        if (typeof value !== 'string') {
            if (key === 'revocation_endpoint') {
                endpoints.revoke = null;
                continue;
            }
            throw new Error('Cloudflare returned incomplete sign-in settings.');
        }
        const endpoint = new URL(value);
        if (
            endpoint.protocol !== 'https:' ||
            endpoint.origin !== issuerOrigin ||
            endpoint.username ||
            endpoint.password ||
            endpoint.hash
        ) {
            throw new Error('Cloudflare returned an unsafe sign-in endpoint.');
        }
        endpoints[key === 'revocation_endpoint' ? 'revoke' : key.replace('_endpoint', '')] =
            endpoint.toString();
    }
    return endpoints;
}

function authorizationLocation(location, endpoints, config) {
    const url = new URL(location);
    const expectedFields = [
        'client_id',
        'response_type',
        'redirect_uri',
        'resource',
        'scope',
        'state',
        'code_challenge',
        'code_challenge_method',
    ];
    if (
        url.origin !== new URL(endpoints.authorization).origin ||
        url.pathname !== new URL(endpoints.authorization).pathname ||
        expectedFields.some((key) => url.searchParams.getAll(key).length !== 1) ||
        url.searchParams.get('client_id') !== config.clientId ||
        url.searchParams.get('response_type') !== 'code' ||
        url.searchParams.get('redirect_uri') !== config.redirectUri ||
        url.searchParams.get('resource') !== config.resource ||
        url.searchParams.get('scope') !== 'openid email profile' ||
        !url.searchParams.get('state') ||
        url.searchParams.get('code_challenge_method') !== 'S256' ||
        !url.searchParams.get('code_challenge')
    ) {
        throw new Error('Haus Server returned an invalid sign-in redirect.');
    }
    return url.toString();
}

function readCallback(value, expectedUri, expectedState) {
    let url;
    let expected;
    try {
        url = new URL(value);
        expected = new URL(expectedUri);
    } catch {
        return null;
    }

    if (
        url.protocol !== expected.protocol ||
        url.hostname !== expected.hostname ||
        url.port !== expected.port ||
        url.pathname !== expected.pathname ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll('state').length !== 1 ||
        url.searchParams.get('state') !== expectedState ||
        [...url.searchParams.keys()].some((key) => !['code', 'error', 'state'].includes(key))
    ) {
        return null;
    }
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (code && !error && url.searchParams.getAll('code').length === 1) {
        return { code, state: expectedState };
    }
    if (
        !code &&
        error &&
        url.searchParams.getAll('error').length === 1 &&
        /^[a-z][a-z0-9_]{0,63}$/u.test(error)
    ) {
        return { error, state: expectedState };
    }
    return null;
}

function readTokenReply(value, now = Date.now) {
    if (
        !value ||
        typeof value.access_token !== 'string' ||
        !value.access_token ||
        typeof value.expires_in !== 'number' ||
        !Number.isFinite(value.expires_in) ||
        value.expires_in <= 0 ||
        (value.refresh_token !== undefined &&
            (typeof value.refresh_token !== 'string' || !value.refresh_token))
    ) {
        throw new Error('Cloudflare returned an invalid sign-in response.');
    }
    return {
        accessToken: value.access_token,
        accessExpiresAt: now() + value.expires_in * 1000,
        refreshToken: value.refresh_token,
    };
}

module.exports = {
    authorizationLocation,
    createPkceAttempt,
    readCallback,
    readTokenReply,
    validateAuthConfig,
    validateOAuthMetadata,
};
