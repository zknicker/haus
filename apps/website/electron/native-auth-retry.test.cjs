'use strict';

const { expect, test } = require('bun:test');
const { createHarness, credentials, deferred, json } = require('./native-auth-test-harness.cjs');

for (const endpoint of ['/oauth/token', '/auth/session']) {
    test(`a temporary ${endpoint} failure refreshes automatically without another sign-in`, async () => {
        let failed = false;
        const clock = createClock();
        const harness = timedHarness(clock, async (url) => {
            if (!failed && clock.now() >= 575_000 && url.pathname === endpoint) {
                failed = true;
                return json({ error: 'temporarily_unavailable' }, 503);
            }
        });
        await harness.manager.initialize();

        await clock.advance(600_000);

        expect(failed).toBe(true);
        expect(harness.manager.currentSession()).not.toBeNull();
        expect(harness.events).not.toContain(null);
        expect(harness.clears).toBe(0);
    });
}

test('an outage expires short access but automatically resumes the retained grant when online', async () => {
    let offline = true;
    const clock = createClock();
    const harness = timedHarness(clock, async (url) => {
        if (offline && clock.now() >= 575_000 && url.pathname === '/oauth/token') {
            throw new TypeError('Network unavailable');
        }
    });
    await harness.manager.initialize();
    await clock.advance(630_000);

    expect(harness.manager.currentSession()).toBeNull();
    expect(harness.store.read()).not.toBeNull();
    expect(harness.clears).toBe(0);
    offline = false;
    await clock.advance(5000);

    expect(harness.manager.currentSession()).not.toBeNull();
    expect(harness.clears).toBe(0);
});

test('a refresh error after waking recovers without reopening OAuth', async () => {
    let failed = false;
    const clock = createClock();
    const harness = timedHarness(clock, async (url) => {
        if (!failed && clock.now() >= 900_000 && url.pathname === '/oauth/token') {
            failed = true;
            return json({ error: 'temporarily_unavailable' }, 503);
        }
    });
    await harness.manager.initialize();
    await clock.wake(900_000);

    expect(harness.manager.currentSession()).toBeNull();
    await clock.advance(5000);

    expect(harness.manager.currentSession()).not.toBeNull();
    expect(harness.store.read()).not.toBeNull();
});

test('cold-start network failure retries without requiring a sign-in', async () => {
    let failed = false;
    const clock = createClock();
    const harness = timedHarness(clock, async (url) => {
        if (!failed && url.pathname === '/auth/session') {
            failed = true;
            throw new TypeError('Network unavailable');
        }
    });
    await expect(harness.manager.initialize()).rejects.toThrow('Network unavailable');
    await clock.advance(5000);

    expect(harness.manager.currentSession()).not.toBeNull();
    expect(harness.clears).toBe(0);
});

test('a revoked grant ends automatic refresh and clears the saved credential', async () => {
    const clock = createClock();
    const harness = timedHarness(clock, async (url) => {
        if (url.pathname === '/oauth/token') {
            return json({ error: 'invalid_grant' }, 400);
        }
    });
    await harness.manager.initialize();
    await clock.advance(600_000);
    const requests = harness.calls.length;
    await clock.advance(60_000);

    expect(harness.manager.currentSession()).toBeNull();
    expect(harness.store.read()).toBeNull();
    expect(harness.calls).toHaveLength(requests);
});

test('a delayed failed refresh cannot restart retries after sign-out', async () => {
    const gate = deferred();
    const clock = createClock();
    const harness = timedHarness(clock, async (url) => {
        if (url.pathname === '/auth/session' && clock.now() >= 35_000) {
            gate.start();
            return gate.promise;
        }
    });
    await harness.manager.initialize();
    await clock.advance(35_000);
    await gate.started;
    await harness.manager.signOut();
    gate.resolve(json({ error: 'temporarily_unavailable' }, 503));
    await clock.advance(60_000);
    const requests = harness.calls.length;
    await clock.advance(60_000);

    expect(harness.store.read()).toBeNull();
    expect(harness.manager.currentSession()).toBeNull();
    expect(harness.calls).toHaveLength(requests);
});

test('a delayed invalid grant cannot clear a replacement account session', async () => {
    let firstRefresh = true;
    let account = 'user-a';
    const gate = deferred();
    const harness = createHarness({
        account: () => account,
        initial: credentials({ accessExpiresAt: 0 }),
        onRequest: async (url) => {
            if (firstRefresh && url.pathname === '/oauth/token') {
                firstRefresh = false;
                gate.start();
                return gate.promise;
            }
        },
    });
    const refresh = harness.manager.refresh();
    await gate.started;
    await harness.manager.signIn(true);
    account = 'user-b';
    const start = harness.calls.find((call) => call.url.pathname === '/auth/start');
    const state = start.url.searchParams.get('state');
    await harness.manager.acceptCallback(`haus://sso-callback?code=replacement&state=${state}`);
    gate.resolve(json({ error: 'invalid_grant' }, 400));
    await refresh;

    expect(harness.manager.currentSession()).toMatchObject({ user: { id: 'usr_user-b' } });
    expect(harness.store.read()).not.toBeNull();
});

function timedHarness(clock, onRequest) {
    let providerExpiresAt = 600_000;
    return createHarness({
        initial: credentials({ accessExpiresAt: 600_000 }),
        now: clock.now,
        timers: clock.timers,
        onRequest: async (url, init) => {
            const result = await onRequest(url, init);
            if (!result && url.pathname === '/oauth/token') {
                providerExpiresAt = clock.now() + 600_000;
            }
            if (result || url.pathname !== '/auth/session') {
                return result;
            }
            return json({
                session: {
                    accessToken: 'fixture-haus-access',
                    expiresAt: new Date(
                        Math.min(clock.now() + 60_000, providerExpiresAt)
                    ).toISOString(),
                    issuedAt: new Date(clock.now()).toISOString(),
                    sessionId: 'fixture-session',
                    user: { id: 'fixture-user', avatarId: null, displayName: null, email: null },
                },
                sessionExpiresAt: new Date(14 * 86_400_000).toISOString(),
                sessionToken: 'fixture-resume',
            });
        },
    });
}

function createClock() {
    let time = 0;
    let nextId = 0;
    const tasks = new Map();
    const flush = async () => {
        for (let count = 0; count < 10; count += 1) {
            await new Promise(setImmediate);
        }
    };
    const runUntil = async (target, waking = false) => {
        if (waking) {
            time = target;
        }
        let iterations = 0;
        while (tasks.size) {
            const [id, task] = [...tasks].sort((one, two) => one[1].at - two[1].at)[0];
            if (task.at > target) {
                break;
            }
            expect(++iterations).toBeLessThan(1000);
            tasks.delete(id);
            time = Math.max(time, task.at);
            task.callback();
            await flush();
        }
        time = target;
        await flush();
    };
    return {
        now: () => time,
        advance: (milliseconds) => runUntil(time + milliseconds),
        wake: (milliseconds) => runUntil(time + milliseconds, true),
        timers: {
            clearTimeout(handle) {
                tasks.delete(handle.id);
            },
            setTimeout(callback, delay) {
                const handle = { id: ++nextId, unref() {} };
                tasks.set(handle.id, { at: time + delay, callback });
                return handle;
            },
        },
    };
}
