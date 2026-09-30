'use strict';
const { expect, test } = require('bun:test');
const { fixture } = require('./browser-test-fakes.cjs');

const noop = () => undefined;

test('⌘-click opens a background tab; ⌘⇧-click and target=_blank open it selected', () => {
    const { workspace, pageAt } = fixture();
    workspace.open('https://example.com');
    const opener = workspace.snapshot().activeId;
    const contents = pageAt(0);
    contents.popup({ url: 'https://example.com/a', disposition: 'background-tab' });
    expect(workspace.snapshot().tabs).toHaveLength(2);
    expect(workspace.snapshot().activeId).toBe(opener);
    contents.popup({ url: 'https://example.com/b', disposition: 'foreground-tab' });
    expect(workspace.snapshot().tabs).toHaveLength(3);
    expect(workspace.snapshot().activeId).not.toBe(opener);
});

test('mail links leave for the OS while other schemes stay blocked', () => {
    const { workspace, pageAt, page } = fixture();
    workspace.open('https://example.com');
    const contents = pageAt(0);
    expect(contents.popup({ url: 'mailto:hi@example.com', disposition: 'foreground-tab' })).toEqual(
        { action: 'deny' }
    );
    contents.popup({ url: 'file:///etc/passwd', disposition: 'foreground-tab' });
    let blocked = false;
    contents.emit('will-navigate', { preventDefault: () => (blocked = true) }, 'mailto:a@b.c');
    expect(blocked).toBe(true);
    let redirected = false;
    contents.emit('will-redirect', { preventDefault: () => (redirected = true) }, 'mailto:x@y.z');
    expect(redirected).toBe(true);
    expect(page.opened).toEqual([
        ['external', 'mailto:hi@example.com'],
        ['external', 'mailto:a@b.c'],
    ]);
    expect(workspace.snapshot().tabs).toHaveLength(1);
});

test('reload, hard reload, and zoom act on the selected page and publish its zoom', () => {
    const { workspace, pageAt } = fixture();
    workspace.open('https://example.com');
    const contents = pageAt(0);
    workspace.command({ kind: 'navigate', action: 'reload' });
    workspace.command({ kind: 'navigate', action: 'hard-reload' });
    expect(workspace.pageAction('zoom-in')).toBe(true);
    expect(contents.calls).toEqual(['reload', 'reloadIgnoringCache']);
    expect(workspace.snapshot().tabs[0].zoomFactor).toBe(1.1);
    workspace.command({ kind: 'navigate', action: 'zoom-reset' });
    expect(workspace.snapshot().tabs[0].zoomFactor).toBe(1);
    workspace.command({ kind: 'select', id: null });
    expect(workspace.pageAction('reload')).toBe(false);
    expect(workspace.hasActiveTab()).toBe(false);
});

test('find reports match counts per tab until the session stops', () => {
    const { workspace, pageAt } = fixture();
    workspace.open('https://example.com');
    const id = workspace.snapshot().activeId;
    const contents = pageAt(0);
    workspace.command({ kind: 'find', id, text: 'haus', forward: true, newSession: true });
    expect(workspace.snapshot().tabs[0].find).toEqual({ activeMatch: 0, matches: 0 });
    contents.emit('found-in-page', {}, { activeMatchOrdinal: 1, matches: 4 });
    expect(workspace.snapshot().tabs[0].find).toEqual({ activeMatch: 1, matches: 4 });
    workspace.command({ kind: 'find', id, text: 'haus', forward: false, newSession: false });
    workspace.command({ kind: 'stop-find', id });
    contents.emit('found-in-page', {}, { activeMatchOrdinal: 2, matches: 4 });
    expect(workspace.snapshot().tabs[0].find).toBeNull();
    expect(contents.calls).toEqual([
        ['findInPage', 'haus', { forward: true, findNext: true }],
        ['findInPage', 'haus', { forward: false, findNext: false }],
        ['stopFindInPage', 'clearSelection'],
    ]);
    expect(() => workspace.command({ kind: 'find', id, text: '' })).toThrow();
    expect(() => workspace.command({ kind: 'find', id: 'gone', text: 'x' })).toThrow();
    workspace.command({ kind: 'stop-find', id: 'gone' });
});

test('right-clicking a page pops its native menu', () => {
    const { workspace, pageAt, page } = fixture();
    workspace.open('https://example.com');
    pageAt(0).emit('context-menu', {}, { linkURL: 'https://example.org' });
    expect(page.menus[0].map((item) => item.label)).toEqual([
        'Open Link in New Tab',
        'Open Link in Default Browser',
        'Copy Link Address',
    ]);
    page.menus[0][0].click();
    expect(workspace.snapshot().tabs).toHaveLength(2);
    expect(workspace.snapshot().tabs[0].id).toBe(workspace.snapshot().activeId);
});

test('page-focused shortcuts reload the page in main and forward tab actions to the App', () => {
    const { workspace, pageAt, window } = fixture();
    workspace.open('https://example.com');
    const contents = pageAt(0);
    const press = (input) => contents.emit('before-input-event', { preventDefault: noop }, input);
    press({ type: 'keyDown', key: 'r', meta: true });
    press({ type: 'keyDown', key: '=', meta: true });
    press({ type: 'keyDown', key: 'f', meta: true });
    press({ type: 'keyDown', key: 'T', meta: true, shift: true });
    expect(contents.calls).toContain('reload');
    expect(contents.zoomFactor).toBe(1.1);
    expect(window.webContents.zoomLevel).toBe(0);
    const shortcuts = window.webContents.sent
        .filter(([channel]) => channel === 'desktop:browser:shortcut')
        .map(([, action]) => action);
    expect(shortcuts).toEqual(['find', 'reopen-tab']);
});
