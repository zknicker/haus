'use strict';
const { expect, test } = require('bun:test');
const { tabMenuItems, windowMenu } = require('./browser-menu-items.cjs');
const { runBrowserWindowAction } = require('./browser-window-actions.cjs');
const { FakeContents } = require('./browser-test-fakes.cjs');

const fakeWindow = () => {
    const app = new FakeContents();
    return { webContents: app, close: () => app.calls.push('window-close') };
};

test('⌘W from a focused page asks the renderer without refocusing the App first', () => {
    // Refocusing the App moved workspace focus off the page, so the renderer
    // saw nothing closable and closed the whole window.
    const win = fakeWindow();
    runBrowserWindowAction(win, { hasActiveTab: () => true }, 'close-tab');
    expect(win.webContents.calls).toEqual([]);
    expect(win.webContents.sent).toEqual([['desktop:window:close-request', undefined]]);
});

test('⌘⇧W closes the window directly', () => {
    const win = fakeWindow();
    runBrowserWindowAction(win, null, 'close-window');
    expect(win.webContents.calls).toEqual(['window-close']);
    expect(win.webContents.sent).toBeUndefined();
});

test('File menu routes ⌘W to the tab action and ⌘⇧W to the window', () => {
    const actions = [];
    const items = tabMenuItems((action) => actions.push(action));
    for (const item of items) {
        item.click?.();
    }
    const accelerators = items.map((item) => item.accelerator).filter(Boolean);
    expect(accelerators).toEqual([
        'CmdOrCtrl+T',
        'CmdOrCtrl+Shift+T',
        'CmdOrCtrl+W',
        'CmdOrCtrl+Shift+W',
    ]);
    expect(actions).toEqual(['new-tab', 'reopen-tab', 'close-tab', 'close-window']);
});

test('the Window menu never carries a Close that would bypass tab closing', () => {
    expect(windowMenu('darwin')).toEqual({ role: 'windowMenu' });
    for (const platform of ['win32', 'linux']) {
        const menu = windowMenu(platform);
        expect(menu.role).toBeUndefined();
        expect(menu.submenu.some((item) => item.role === 'close')).toBe(false);
    }
});

test('Reload Page reloads the focused web page, else asks the renderer to refetch its App page', () => {
    const withPage = fakeWindow();
    const reloaded = [];
    runBrowserWindowAction(
        withPage,
        { pageAction: (action) => reloaded.push(action) > 0 },
        'reload'
    );
    expect(reloaded).toEqual(['reload']);
    expect(withPage.webContents.sent).toBeUndefined();

    const appPage = fakeWindow();
    runBrowserWindowAction(appPage, { pageAction: () => false }, 'reload');
    expect(appPage.webContents.sent).toEqual([['desktop:browser:shortcut', 'reload']]);
    // Never the Haus renderer itself.
    expect(appPage.webContents.loads).toEqual([]);
});
