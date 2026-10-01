'use strict';
const { describe, expect, test } = require('bun:test');
const { nextZoomFactor, runPageAction } = require('./browser-page-actions.cjs');
const { browserPageMenuTemplate } = require('./browser-page-menu.cjs');
const { runBrowserWindowAction } = require('./browser-window-actions.cjs');
const { FakeContents } = require('./browser-test-fakes.cjs');

describe('page actions', () => {
    test('reload keeps the cache and hard reload bypasses it, both clearing the error', () => {
        const contents = new FakeContents();
        const state = { error: 'Offline' };
        runPageAction(contents, state, { action: 'reload' }, () => undefined);
        expect(state.error).toBeNull();
        state.error = 'Offline';
        runPageAction(contents, state, { action: 'hard-reload' }, () => undefined);
        expect(state.error).toBeNull();
        runPageAction(contents, state, { action: 'stop' }, () => undefined);
        expect(contents.calls).toEqual(['reload', 'reloadIgnoringCache', 'stop']);
        expect(() =>
            runPageAction(contents, state, { action: 'print' }, () => undefined)
        ).toThrow();
    });
    test('zoom walks Chrome steps, clamps at the ends, and publishes the factor', () => {
        expect(nextZoomFactor(1, 'zoom-in')).toBe(1.1);
        expect(nextZoomFactor(1, 'zoom-out')).toBe(0.9);
        expect(nextZoomFactor(1.2, 'zoom-in')).toBe(1.25);
        expect(nextZoomFactor(5, 'zoom-in')).toBe(5);
        expect(nextZoomFactor(0.25, 'zoom-out')).toBe(0.25);
        expect(nextZoomFactor(3, 'zoom-reset')).toBe(1);
        const contents = new FakeContents();
        const state = { zoomFactor: 1 };
        let published = 0;
        runPageAction(contents, state, { action: 'zoom-in' }, () => published++);
        runPageAction(contents, state, { action: 'zoom-in' }, () => published++);
        expect(contents.zoomFactor).toBe(1.25);
        expect(state.zoomFactor).toBe(1.25);
        runPageAction(contents, state, { action: 'zoom-reset' }, () => published++);
        expect(contents.zoomFactor).toBe(1);
        expect(published).toBe(3);
    });
});

describe('page context menu', () => {
    const services = () => {
        const log = [];
        const contents = new FakeContents();
        contents.copy = () => log.push('copy');
        contents.copyImageAt = (x, y) => log.push(['copyImageAt', x, y]);
        contents.inspectElement = (x, y) => log.push(['inspect', x, y]);
        return {
            log,
            actions: {
                clipboard: { writeText: (value) => log.push(['clipboard', value]) },
                contents,
                inspect: false,
                openExternal: async (url) => log.push(['external', url]),
                openTab: (url, options) => log.push(['tab', url, options]),
            },
        };
    };
    const labels = (template) => template.map((item) => item.label ?? '---');
    const item = (template, label) => template.find((entry) => entry.label === label);

    test('a bare page offers history and reload; development adds Inspect Element', () => {
        const { actions, log } = services();
        expect(labels(browserPageMenuTemplate({ x: 1, y: 2 }, actions))).toEqual([
            'Back',
            'Forward',
            'Reload',
        ]);
        expect(item(browserPageMenuTemplate({}, actions), 'Back').enabled).toBe(false);
        const dev = browserPageMenuTemplate({ x: 1, y: 2 }, { ...actions, inspect: true });
        expect(labels(dev)).toEqual(['Back', 'Forward', 'Reload', '---', 'Inspect Element']);
        item(dev, 'Inspect Element').click();
        expect(log).toEqual([['inspect', 1, 2]]);
    });
    test('links open in a background tab, the default browser, or the clipboard', () => {
        const { actions, log } = services();
        const template = browserPageMenuTemplate({ linkURL: 'https://example.com/a' }, actions);
        expect(labels(template)).toEqual([
            'Open Link in New Tab',
            'Open Link in Default Browser',
            'Copy Link Address',
        ]);
        for (const entry of template) {
            entry.click();
        }
        expect(log).toEqual([
            ['tab', 'https://example.com/a', { background: true }],
            ['external', 'https://example.com/a'],
            ['clipboard', 'https://example.com/a'],
        ]);
        const script = browserPageMenuTemplate({ linkURL: 'javascript:alert(1)' }, actions);
        expect(item(script, 'Open Link in New Tab').enabled).toBe(false);
        expect(item(script, 'Open Link in Default Browser').enabled).toBe(false);
    });
    test('selections copy or search Google, and images copy or open', () => {
        const { actions, log } = services();
        const long = 'a very long selection that keeps going past the label';
        const selection = browserPageMenuTemplate({ selectionText: `  ${long}\n` }, actions);
        expect(labels(selection)).toEqual([
            'Copy',
            'Search Google for “a very long selection that keep…”',
        ]);
        selection[1].click();
        expect(log.at(-1)).toEqual([
            'tab',
            `https://www.google.com/search?q=${encodeURIComponent(long)}`,
            { background: false },
        ]);
        const image = browserPageMenuTemplate(
            { mediaType: 'image', srcURL: 'data:image/png;base64,AA', x: 5, y: 6 },
            actions
        );
        expect(labels(image)).toEqual(['Open Image in New Tab', 'Copy Image']);
        expect(image[0].enabled).toBe(false);
        image[1].click();
        expect(log.at(-1)).toEqual(['copyImageAt', 5, 6]);
    });
    test('editable fields get edit commands gated by their flags', () => {
        const { actions } = services();
        const template = browserPageMenuTemplate(
            { isEditable: true, selectionText: 'x', editFlags: { canPaste: true } },
            actions
        );
        expect(labels(template)).toEqual(['Cut', 'Copy', 'Paste', 'Select All']);
        expect(template.map((entry) => entry.enabled)).toEqual([false, false, true, false]);
    });
});

describe('window actions', () => {
    const window = () => {
        const app = new FakeContents();
        return { webContents: app, close: () => app.calls.push('window-close') };
    };
    test('reload acts on the selected page only and never reloads the App', () => {
        const win = window();
        const workspace = { pageAction: () => false, hasActiveTab: () => false };
        runBrowserWindowAction(win, workspace, 'reload');
        runBrowserWindowAction(win, null, 'hard-reload');
        expect(win.webContents.calls).toEqual([]);
        const handled = [];
        runBrowserWindowAction(
            win,
            { pageAction: (action) => handled.push(action) > 0, hasActiveTab: () => true },
            'zoom-in'
        );
        expect(handled).toEqual(['zoom-in']);
        expect(win.webContents.zoomLevel).toBe(0);
    });
    test('zoom without a selected page zooms the App like the stock roles', () => {
        const win = window();
        runBrowserWindowAction(win, null, 'zoom-in');
        runBrowserWindowAction(win, null, 'zoom-in');
        runBrowserWindowAction(win, null, 'zoom-out');
        expect(win.webContents.zoomLevel).toBe(0.5);
        runBrowserWindowAction(win, null, 'zoom-reset');
        expect(win.webContents.zoomLevel).toBe(0);
    });
    test('find goes to the page find bar with a selected page, otherwise to Search', () => {
        const win = window();
        runBrowserWindowAction(win, { hasActiveTab: () => false }, 'find');
        runBrowserWindowAction(win, { hasActiveTab: () => true }, 'find');
        runBrowserWindowAction(win, null, 'reopen-tab');
        runBrowserWindowAction(win, null, 'new-tab');
        runBrowserWindowAction(win, null, 'close-tab');
        runBrowserWindowAction(win, null, 'settings');
        expect(win.webContents.sent).toEqual([
            ['desktop:search:open', undefined],
            ['desktop:browser:shortcut', 'find'],
            ['desktop:browser:shortcut', 'reopen-tab'],
            ['desktop:window:new-tab', undefined],
            ['desktop:window:close-request', undefined],
            ['desktop:settings:open', undefined],
        ]);
        win.webContents.isCrashed = () => true;
        runBrowserWindowAction(win, null, 'close-tab');
        expect(win.webContents.calls.at(-1)).toBe('window-close');
    });
});
