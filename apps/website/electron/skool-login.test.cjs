'use strict';

const { EventEmitter } = require('node:events');
const { expect, test } = require('bun:test');
const { FakeView, fixture, page } = require('./browser-test-fakes.cjs');
const { createBrowserWorkspace } = require('./browser-workspace.cjs');
const { waitForSkoolSession } = require('./skool-login.cjs');

function contents(url, cookies) {
    const view = new EventEmitter();
    view.isDestroyed = () => false;
    view.getURL = () => url;
    view.session = { cookies: { get: async () => cookies } };
    return view;
}

test('captures HttpOnly Skool session cookies only after leaving the login page', async () => {
    const cookies = [
        { name: 'auth_token', value: 'native', httpOnly: true },
        { name: 'aws-waf-token', value: 'waf' },
    ];
    const view = contents('https://www.skool.com/login', cookies);
    const pending = waitForSkoolSession(view, { timeoutMs: 2000 });
    view.getURL = () => 'https://www.skool.com/';
    expect(await pending).toEqual({
        auth_token: 'native',
        waf_token: 'waf',
        cookie_header: 'auth_token=native; aws-waf-token=waf',
    });
    expect(view.listenerCount('destroyed')).toBe(0);
});

test('a third-party page cannot supply a session even if it has cookies', async () => {
    const view = contents('https://www.skool.com.evil.test/', [
        { name: 'auth_token', value: 'native' },
        { name: 'aws-waf-token', value: 'waf' },
    ]);
    await expect(waitForSkoolSession(view, { timeoutMs: 15 })).rejects.toThrow('timed out');
});

test('closing the login tab cancels and removes its watcher', async () => {
    const view = contents('', []);
    const pending = waitForSkoolSession(view);
    view.emit('destroyed');
    await expect(pending).rejects.toThrow('canceled');
    expect(view.listenerCount('destroyed')).toBe(0);
});

test('login uses a fresh session and normal tab mounting preserves that session', async () => {
    const { window } = fixture();
    const isolated = { cookies: { get: async () => [] } };
    const workspace = createBrowserWorkspace(window, {
        WebContentsView: FakeView,
        browserSession: { shared: true },
        page: page(),
        skoolSession: () => isolated,
    });
    workspace.command({ kind: 'mount' });
    const pending = workspace.skoolLogin('login-one');
    const view = [...window.children][0];
    expect(view.options.webPreferences.session).toBe(isolated);
    expect(view.options.webPreferences.preload).toBeUndefined();
    workspace.command({ kind: 'open', url: 'https://www.skool.com/login', viewId: 'login-one' });
    expect(window.children.size).toBe(1);
    expect(view.webContents.loads).toEqual(['https://www.skool.com/login']);
    view.webContents.emit('destroyed');
    await expect(pending).rejects.toThrow('canceled');
});
