'use strict';

const { createHash } = require('node:crypto');
const { expect, test } = require('bun:test');
const {
    authorizationLocation,
    createPkceAttempt,
    readCallback,
    readTokenReply,
    validateOAuthMetadata,
} = require('./native-oauth.cjs');

const config = {
    clientId: 'native-client',
    issuer: 'https://access.example.test',
    redirectUri: 'https://haus.chat/auth/callback',
    resource: 'https://haus.chat/auth/session',
};

test('PKCE attempts use unpredictable base64url state and an S256 verifier challenge', () => {
    const attempt = createPkceAttempt('haus://sso-callback', 1234);

    expect(attempt).toMatchObject({ createdAt: 1234, redirectUri: 'haus://sso-callback' });
    expect(attempt.state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(attempt.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(attempt.challenge).toBe(
        createHash('sha256').update(attempt.verifier).digest('base64url')
    );
});

test('OAuth discovery keeps every credential endpoint on the configured HTTPS issuer', () => {
    expect(
        validateOAuthMetadata(config, {
            authorization_endpoint: 'https://access.example.test/oauth/authorize',
            issuer: config.issuer,
            revocation_endpoint: 'https://access.example.test/oauth/revoke',
            token_endpoint: 'https://access.example.test/oauth/token',
        })
    ).toEqual({
        authorization: 'https://access.example.test/oauth/authorize',
        revoke: 'https://access.example.test/oauth/revoke',
        token: 'https://access.example.test/oauth/token',
    });

    expect(() =>
        validateOAuthMetadata(config, {
            authorization_endpoint: 'https://attacker.example/oauth/authorize',
            issuer: config.issuer,
            token_endpoint: 'https://access.example.test/oauth/token',
        })
    ).toThrow('unsafe sign-in endpoint');
    expect(() =>
        validateOAuthMetadata(config, {
            authorization_endpoint: 'http://access.example.test/oauth/authorize',
            issuer: 'https://attacker.example',
            token_endpoint: 'https://access.example.test/oauth/token',
        })
    ).toThrow('unexpected issuer');
});

test('broker authorize redirects must carry the configured HTTPS exchange target and PKCE', () => {
    const authorize = new URL('https://access.example.test/oauth/authorize');
    authorize.searchParams.set('client_id', config.clientId);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('redirect_uri', config.redirectUri);
    authorize.searchParams.set('resource', config.resource);
    authorize.searchParams.set('scope', 'openid email profile');
    authorize.searchParams.set('state', 'broker-state');
    authorize.searchParams.set('code_challenge_method', 'S256');
    authorize.searchParams.set('code_challenge', 'challenge');
    const endpoints = { authorization: 'https://access.example.test/oauth/authorize' };

    expect(authorizationLocation(authorize, endpoints, config)).toBe(authorize.toString());
    authorize.searchParams.set('redirect_uri', 'haus://sso-callback');
    expect(() => authorizationLocation(authorize, endpoints, config)).toThrow(
        'invalid sign-in redirect'
    );
});

test('callbacks must match the pending redirect URI and state exactly', () => {
    const expected = 'haus://sso-callback';
    expect(
        readCallback(`${expected}?code=one-use-code&state=pending-state`, expected, 'pending-state')
    ).toEqual({ code: 'one-use-code', state: 'pending-state' });
    expect(
        readCallback(`${expected}?code=one-use-code&state=old-state`, expected, 'pending-state')
    ).toBeNull();
    expect(
        readCallback(
            'haus://settings?code=one-use-code&state=pending-state',
            expected,
            'pending-state'
        )
    ).toBeNull();
    expect(
        readCallback(`${expected}?code=one&code=two&state=pending-state`, expected, 'pending-state')
    ).toBeNull();
    expect(
        readCallback(
            `${expected}?error=access_denied&state=pending-state`,
            expected,
            'pending-state'
        )
    ).toEqual({ error: 'access_denied', state: 'pending-state' });
    expect(
        readCallback(
            'http://127.0.0.1:43123/sso-callback/0123456789abcdef0123456789abcdef0123456789abcdef?code=code&state=state',
            'http://127.0.0.1:43123/sso-callback/0123456789abcdef0123456789abcdef0123456789abcdef',
            'state'
        )
    ).toEqual({ code: 'code', state: 'state' });
});

test('provider expiry uses the server returned expires_in', () => {
    expect(readTokenReply({ access_token: 'access', expires_in: 600 }, () => 5000)).toEqual({
        accessExpiresAt: 605_000,
        accessToken: 'access',
        refreshToken: undefined,
    });
});
