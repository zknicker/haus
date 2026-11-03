'use strict';

const { expect, test } = require('bun:test');
const {
    config,
    createHarness,
    credentials,
    deferred,
    json,
    nativeSession,
} = require('./native-auth-test-harness.cjs');

test('native PKCE exchanges only the broker callback code and persists provider refresh before session', async () => {
    const harness = createHarness();

    await harness.manager.signIn();
    const start = harness.calls.find((call) => call.url.pathname === '/auth/start');
    expect(start.url.searchParams.get('client')).toBe('desktop');
    const nativeState = start.url.searchParams.get('state');
    const challenge = start.url.searchParams.get('codeChallenge');
    expect(start.url.searchParams.get('redirectUri')).toBe('haus://sso-callback');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const callback = `haus://sso-callback?code=one-use-code&state=${encodeURIComponent(nativeState)}`;
    await harness.manager.acceptCallback(callback);

    const exchange = harness.calls.find((call) => call.url.pathname === '/oauth/token');
    const form = new URLSearchParams(exchange.init.body);
    expect(form.get('code')).toBe('one-use-code');
    expect(form.get('redirect_uri')).toBe(config.redirectUri);
    expect(form.get('redirect_uri')).not.toBe('haus://sso-callback');
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(harness.calls.find((call) => call.url.pathname === '/auth/session')).toBeDefined();
    expect(harness.writes[0]).toMatchObject({
        accessToken: 'provider-access-1',
        refreshToken: 'provider-refresh-1',
        sessionToken: null,
    });
    expect(harness.manager.currentSession()).toMatchObject({
        accessToken: 'haus-access-user-a',
        user: { id: 'usr_user-a' },
    });
    await harness.manager.acceptCallback(callback);
    expect(harness.calls.filter((call) => call.url.pathname === '/oauth/token')).toHaveLength(1);
});

test('same-origin stale state and post-logout OAuth responses cannot restore a session', async () => {
    const gate = deferred();
    const harness = createHarness({
        initial: credentials(),
        onRequest: async (url) => {
            if (url.pathname === '/auth/session') {
                gate.start();
                return gate.promise;
            }
        },
    });

    const refresh = harness.manager.refresh();
    await gate.started;
    await harness.manager.signOut();
    gate.resolve(json(nativeSession('user-a', 'late-access')));
    await expect(refresh).resolves.toBeNull();

    expect(harness.store.read()).toBeNull();
    expect(harness.manager.currentSession()).toBeNull();
    expect(harness.events.at(-1)).toBeNull();
    expect(harness.clears).toBeGreaterThanOrEqual(1);
});

test('a new account does not inherit an older in-flight session refresh', async () => {
    const gate = deferred();
    let account = 'user-a';
    let holdFirstSession = true;
    const harness = createHarness({
        initial: credentials(),
        account: () => account,
        onRequest: async (url) => {
            if (url.pathname === '/auth/session' && holdFirstSession) {
                holdFirstSession = false;
                gate.start();
                return gate.promise;
            }
        },
    });

    const oldRefresh = harness.manager.refresh();
    await gate.started;
    await harness.manager.signIn(true);
    account = 'user-b';
    const start = harness.calls.filter((call) => call.url.pathname === '/auth/start').at(-1);
    const state = start.url.searchParams.get('state');
    await harness.manager.acceptCallback(`haus://sso-callback?code=second&state=${state}`);

    const currentRefresh = await harness.manager.refresh();
    gate.resolve(json(nativeSession('user-a', 'late-access')));
    await expect(oldRefresh).resolves.toBeNull();

    expect(currentRefresh).toMatchObject({ user: { id: 'usr_user-b' } });
    expect(harness.manager.currentSession()).toMatchObject({ user: { id: 'usr_user-b' } });
    expect(harness.calls.filter((call) => call.url.pathname === '/auth/session')).toHaveLength(3);
});

test('switching accounts clears the old identity before opening the next sign-in', async () => {
    let account = 'user-a';
    const harness = createHarness({ account: () => account, initial: credentials() });
    await harness.manager.refresh();
    await harness.manager.signIn(true);
    account = 'user-b';

    expect(harness.store.read()).toBeNull();
    expect(harness.events.at(-1)).toBeNull();
    const start = harness.calls.filter((call) => call.url.pathname === '/auth/start').at(-1);
    const state = start.url.searchParams.get('state');
    await harness.manager.acceptCallback(`haus://sso-callback?code=second&state=${state}`);

    expect(harness.manager.currentSession()).toMatchObject({ user: { id: 'usr_user-b' } });
    expect(harness.order.filter((entry) => entry.kind === 'clear')).toHaveLength(1);
});
