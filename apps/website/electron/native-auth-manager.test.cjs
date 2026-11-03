'use strict';

const { expect, test } = require('bun:test');
const {
    createHarness,
    credentials,
    deferred,
    json,
    waitFor,
} = require('./native-auth-test-harness.cjs');

test('refreshes cannot restart while main is clearing a desktop session', async () => {
    const logout = deferred();
    const harness = createHarness({
        initial: credentials(),
        onRequest: async (url) => {
            if (url.pathname === '/auth/logout') {
                logout.start();
                return logout.promise;
            }
        },
    });

    const signOut = harness.manager.signOut();
    await logout.started;
    await expect(harness.manager.refresh()).resolves.toBeNull();
    expect(harness.calls.filter((call) => call.url.pathname === '/auth/session')).toHaveLength(0);
    logout.resolve(json({}));
    await signOut;

    expect(harness.store.read()).toBeNull();
    expect(harness.manager.currentSession()).toBeNull();
});

test('one main-process refresh writer persists a rotated provider grant before resuming Haus', async () => {
    const gate = deferred();
    let refreshTokenCalls = 0;
    const harness = createHarness({
        initial: credentials({ accessExpiresAt: 1000 }),
        onRequest: async (url, init) => {
            if (
                url.pathname === '/oauth/token' &&
                new URLSearchParams(init.body).get('grant_type') === 'refresh_token'
            ) {
                refreshTokenCalls += 1;
                gate.start();
                await gate.promise;
                return json({
                    access_token: 'provider-access-2',
                    expires_in: 600,
                    refresh_token: 'provider-refresh-2',
                });
            }
        },
    });

    const one = harness.manager.refresh();
    const two = harness.manager.refresh();
    await waitFor(() => refreshTokenCalls === 1);
    gate.resolve();
    await Promise.all([one, two]);

    const sessionIndex = harness.calls.findIndex((call) => call.url.pathname === '/auth/session');
    const rotatedWriteIndex = harness.order.findIndex(
        (entry) => entry.kind === 'write' && entry.value.refreshToken === 'provider-refresh-2'
    );
    expect(refreshTokenCalls).toBe(1);
    expect(rotatedWriteIndex).toBeLessThan(
        harness.order.findIndex(
            (entry) => entry.kind === 'request' && entry.path === '/auth/session'
        )
    );
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(harness.store.read()).toMatchObject({
        accessToken: 'provider-access-2',
        refreshToken: 'provider-refresh-2',
        sessionToken: 'resume-next',
    });
});

test('the dev session fixture is used only for loopback, un-packaged shells', async () => {
    const local = createHarness({ appUrl: 'http://127.0.0.1:3101', isPackaged: false });
    await local.manager.initialize();
    expect(local.calls.map((call) => call.url.pathname)).toEqual(['/auth/dev/session']);
    expect(local.manager.currentSession()).toMatchObject({ user: { id: 'usr_user-a' } });

    const hosted = createHarness({ appUrl: 'http://haus.chat', isPackaged: false });
    await hosted.manager.initialize();
    expect(hosted.calls).toHaveLength(0);
    expect(hosted.manager.currentSession()).toBeNull();
});
