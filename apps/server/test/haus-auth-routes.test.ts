import { afterAll, beforeAll, expect, test } from 'bun:test';
import { resumeCookieName, stateCookieName } from '../src/identity/auth-http.ts';
import {
    cloudflareAuthResource,
    cloudflareNativeClientId,
} from '../src/identity/cloudflare-access.ts';
import { type CloudflareTestIssuer, startCloudflareTestIssuer } from './cloudflare-test-issuer.ts';
import { createHausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const humanSubject = 'cf-subject-auth-routes';
const humanEmail = 'owner@haus.test';
const nativeChallenge = 'A'.repeat(43);
const metadata = {
    authorization_endpoint:
        'https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/authorization',
    code_challenge_methods_supported: ['S256'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    issuer: 'https://thearcade.cloudflareaccess.com',
    revocation_endpoint: 'https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/revoke',
    response_types_supported: ['code'],
    token_endpoint: 'https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/token',
    token_endpoint_auth_methods_supported: ['none'],
};

let harness: HausServerHarness;
let issuer: CloudflareTestIssuer;
let userId: string;

beforeAll(async () => {
    issuer = await startCloudflareTestIssuer();
    harness = await startHausServerHarness({
        cloudflareAccess: { audience: issuer.audience, issuer: issuer.url },
        cloudflareOAuthMetadataFetch: async () => Response.json(metadata),
    });
    harness.humans.setVerifiedEmails(humanSubject, [humanEmail]);
    await harness.humans.mintSessionToken(humanSubject);
    userId = harness.humans.userIdForSubject(humanSubject);
});

afterAll(async () => {
    await harness.close();
    await issuer.close();
});

test('browser admission sets a Lax state cookie, mints a stable Haus session, and enforces CSRF', async () => {
    const start = await fetch(
        new URL('/auth/start?returnTo=%2Finvite%3Fcode%3Djoin', harness.url),
        {
            redirect: 'manual',
        }
    );
    expect(start.status).toBe(303);
    const startCookie = setCookies(start).find((cookie) =>
        cookie.startsWith(`${stateCookieName(harness.appOrigin)}=`)
    );
    expect(startCookie).toContain('HttpOnly');
    expect(startCookie).toContain('SameSite=Lax');
    expect(startCookie).toContain('Secure');
    const state = new URL(start.headers.get('location') ?? '').searchParams.get('state');
    expect(state).toBeTruthy();

    const assertion = await issuer.mintAssertion({ email: humanEmail, subject: humanSubject });
    const complete = await fetch(new URL(`/auth/complete?state=${state}`, harness.url), {
        headers: { cookie: cookiePair(startCookie), 'cf-access-jwt-assertion': assertion },
        redirect: 'manual',
    });
    expect(complete.status).toBe(303);
    expect(complete.headers.get('location')).toBe('https://app.haus.test/invite?code=join');
    const resumeCookie = setCookies(complete).find((cookie) =>
        cookie.startsWith(`${resumeCookieName(harness.appOrigin)}=`)
    );
    expect(resumeCookie).toContain('HttpOnly');
    expect(resumeCookie).toContain('SameSite=Lax');
    expect(resumeCookie).toContain('Secure');

    const requestHeaders = {
        cookie: cookiePair(resumeCookie),
        'cf-access-jwt-assertion': await issuer.mintAssertion({
            email: humanEmail,
            subject: humanSubject,
        }),
        origin: harness.appOrigin,
        'sec-fetch-site': 'same-origin',
        'x-haus-session-request': '1',
    };
    const sessionResponse = await fetch(new URL('/auth/session', harness.url), {
        headers: requestHeaders,
    });
    const session = await sessionResponse.json();
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.headers.get('cache-control')).toBe('no-store');
    expect(session.user).toMatchObject({ id: userId, email: humanEmail });
    expect(session.sessionId).toMatch(/^has_[A-Za-z0-9_-]{16}$/u);
    expect(Date.parse(session.expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);

    const noMarker = await fetch(new URL('/auth/session', harness.url), {
        headers: { ...requestHeaders, 'x-haus-session-request': '' },
    });
    expect(noMarker.status).toBe(403);
    const crossOrigin = await fetch(new URL('/auth/session', harness.url), {
        headers: { ...requestHeaders, origin: 'https://evil.example' },
    });
    expect(crossOrigin.status).toBe(403);
});

test('native broker binds PKCE and state to one stored callback and consumes it once', async () => {
    const redirectUri = 'haus://sso-callback';
    const nativeState = 'ios-state-from-the-native-client';
    const start = await fetch(
        new URL(
            `/auth/start?client=ios&redirectUri=${encodeURIComponent(redirectUri)}` +
                `&state=${encodeURIComponent(nativeState)}&codeChallenge=${nativeChallenge}` +
                '&switchAccount=true',
            harness.url
        ),
        { redirect: 'manual' }
    );
    expect(start.status).toBe(302);
    const authorization = new URL(start.headers.get('location') ?? '');
    expect(authorization).toMatchObject({
        origin: 'https://thearcade.cloudflareaccess.com',
        pathname: '/cdn-cgi/access/oauth/authorization',
    });
    expect(authorization.searchParams.get('client_id')).toBe(cloudflareNativeClientId);
    expect(authorization.searchParams.get('redirect_uri')).toBe('https://haus.chat/auth/callback');
    expect(authorization.searchParams.get('resource')).toBe(cloudflareAuthResource);
    expect(authorization.searchParams.get('code_challenge')).toBe(nativeChallenge);
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    const serverState = authorization.searchParams.get('state');
    expect(serverState).toBeTruthy();

    const wrongState = await fetch(
        new URL('/auth/callback?code=one-time-code&state=wrong-state', harness.url),
        { redirect: 'manual' }
    );
    expect(wrongState.status).toBe(400);

    const callback = await fetch(
        new URL(
            `/auth/callback?code=${encodeURIComponent('one-time-code')}` +
                `&state=${encodeURIComponent(serverState ?? '')}`,
            harness.url
        ),
        { redirect: 'manual' }
    );
    expect(callback.status).toBe(302);
    const forwarded = new URL(callback.headers.get('location') ?? '');
    expect(forwarded.protocol).toBe('haus:');
    expect(forwarded.hostname).toBe('sso-callback');
    expect(forwarded.searchParams.get('code')).toBe('one-time-code');
    expect(forwarded.searchParams.get('state')).toBe(nativeState);
    expect(callback.headers.get('referrer-policy')).toBe('no-referrer');

    const replay = await fetch(
        new URL(
            `/auth/callback?code=${encodeURIComponent('one-time-code')}` +
                `&state=${encodeURIComponent(serverState ?? '')}`,
            harness.url
        ),
        { redirect: 'manual' }
    );
    expect(replay.status).toBe(400);
});

test('native session exchange rotates access while keeping the same Haus session', async () => {
    const assertion = () => issuer.mintAssertion({ email: humanEmail, subject: humanSubject });
    const first = await fetch(new URL('/auth/session', harness.url), {
        body: JSON.stringify({ client: 'ios' }),
        headers: {
            'cf-access-jwt-assertion': await assertion(),
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    const original = await first.json();
    expect(first.status).toBe(200);
    expect(original.session.user.id).toBe(userId);
    expect(original.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const resumed = await fetch(new URL('/auth/session', harness.url), {
        body: JSON.stringify({ client: 'ios', sessionToken: original.sessionToken }),
        headers: {
            'cf-access-jwt-assertion': await assertion(),
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    const rotated = await resumed.json();
    expect(resumed.status).toBe(200);
    expect(rotated.session.sessionId).toBe(original.session.sessionId);
    expect(rotated.session.accessToken).not.toBe(original.session.accessToken);
    expect(rotated.sessionToken).toBe(original.sessionToken);

    const client = createHausClient(harness, rotated.session.accessToken);
    try {
        const logout = await fetch(new URL('/auth/logout', harness.url), {
            body: JSON.stringify({ client: 'ios', sessionToken: rotated.sessionToken }),
            headers: {
                'content-type': 'application/json',
                origin: harness.appOrigin,
                'x-haus-session-request': '1',
            },
            method: 'POST',
        });
        expect(logout.status).toBe(204);
        expect(setCookies(logout).some((cookie) => cookie.includes('Max-Age=0'))).toBe(true);
        await expect(client.trpc.server.list.query()).rejects.toMatchObject({
            data: { code: 'UNAUTHORIZED' },
        });
    } finally {
        client.close();
    }
});

test('local development fixture is loopback-only, fixed-identity, and isolates port cookies', async () => {
    expect(resumeCookieName('http://127.0.0.1:3100')).not.toBe(
        resumeCookieName('http://127.0.0.1:3101')
    );
    expect(resumeCookieName('https://haus.chat')).toBe('__Host-haus_resume');

    const localHarness = await startHausServerHarness({
        appOrigin: 'http://localhost:3100',
        cloudflareOAuthMetadataFetch: async () => Response.json({}, { status: 503 }),
        enableDevelopmentAuth: true,
    });
    try {
        const browser = await fetch(new URL('/auth/dev/session', localHarness.url));
        expect(browser.status).toBe(200);
        const firstSession = await browser.json();
        expect(firstSession).toMatchObject({ user: { displayName: 'Zach' } });
        const cookie = setCookies(browser).find((value) =>
            value.startsWith(`${resumeCookieName(localHarness.appOrigin)}=`)
        );
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).not.toContain('Secure');

        const metadataUnavailable = await fetch(
            new URL(
                '/auth/start?client=ios&redirectUri=haus%3A%2F%2Fsso-callback' +
                    '&state=ios-state&codeChallenge=' +
                    nativeChallenge,
                localHarness.url
            ),
            { redirect: 'manual' }
        );
        expect(metadataUnavailable.status).toBe(503);
        expect(await metadataUnavailable.json()).toMatchObject({ error: 'auth_unavailable' });

        const resumedBrowser = await fetch(new URL('/auth/dev/session', localHarness.url), {
            headers: { cookie: cookiePair(cookie) },
        });
        const resumedSession = await resumedBrowser.json();
        expect(resumedBrowser.status).toBe(200);
        expect(resumedSession.sessionId).toBe(firstSession.sessionId);
        expect(resumedSession.accessToken).not.toBe(firstSession.accessToken);
        expect(setCookies(resumedBrowser).some((value) => value.includes('Max-Age=0'))).toBe(false);

        const native = await fetch(new URL('/auth/dev/session', localHarness.url), {
            body: JSON.stringify({ client: 'ios' }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(native.status).toBe(200);
        expect(await native.json()).toMatchObject({
            session: { user: { displayName: 'Zach' } },
            sessionToken: expect.any(String),
        });

        const arbitraryIdentity = await fetch(new URL('/auth/dev/session', localHarness.url), {
            body: JSON.stringify({ client: 'ios', subject: 'attacker' }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(arbitraryIdentity.status).toBe(400);
        const forwardedHost = await fetch(new URL('/auth/dev/session', localHarness.url), {
            headers: { host: 'haus.example' },
        });
        expect(forwardedHost.status).toBe(404);
    } finally {
        await localHarness.close();
    }
});

function setCookies(response: Response) {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    return headers.getSetCookie?.() ?? [response.headers.get('set-cookie') ?? ''];
}

function cookiePair(value: string | undefined) {
    if (!value) {
        return '';
    }
    return value.split(';', 1)[0] ?? '';
}
