'use strict';
const { expect, test } = require('bun:test');
const { fixture } = require('./browser-test-fakes.cjs');

const noop = () => undefined;
const bounds = { x: 0, y: 40, width: 400, height: 600 };

function openRequests(window) {
    return (window.webContents.sent ?? [])
        .filter(([channel]) => channel === 'desktop:browser:open-request')
        .map(([, request]) => request);
}

// Chromium's dispositions: ⌘- or middle-click is background-tab, ⌘⇧-click and target=_blank
// foreground-tab, ⇧-click new-window (a selected tab in Haus).
test('⌘- and middle-click ask for a background tab; ⌘⇧-, ⇧-click, and target=_blank for a selected one', () => {
    const { workspace, pageAt, window } = fixture();
    workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'opener' });
    const contents = pageAt(0);
    contents.popup({ url: 'https://example.com/a', disposition: 'background-tab' });
    contents.popup({ url: 'https://example.com/b', disposition: 'foreground-tab' });
    contents.popup({ url: 'https://example.com/c', disposition: 'new-window' });
    expect(openRequests(window)).toEqual([
        { url: 'https://example.com/a', openerId: 'opener', background: true },
        { url: 'https://example.com/b', openerId: 'opener', background: false },
        { url: 'https://example.com/c', openerId: 'opener', background: false },
    ]);
    expect(workspace.snapshot().tabs).toHaveLength(1);
});

test('mail links leave for the OS while other schemes stay blocked', () => {
    const { workspace, pageAt, page, window } = fixture();
    workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'one' });
    const contents = pageAt(0);
    expect(contents.popup({ url: 'mailto:hi@example.com', disposition: 'foreground-tab' })).toEqual(
        { action: 'deny' }
    );
    contents.popup({ url: 'file:///etc/passwd', disposition: 'foreground-tab' });
    let blocked = false;
    contents.emit('will-navigate', { preventDefault: () => (blocked = true) }, 'mailto:a@b.c');
    expect(blocked).toBe(true);
    expect(page.opened).toEqual([
        ['external', 'mailto:hi@example.com'],
        ['external', 'mailto:a@b.c'],
    ]);
    expect(openRequests(window)).toEqual([]);
});

test('menu page actions act on the focused placed view only', () => {
    const { workspace, pageAt } = fixture();
    workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'left' });
    workspace.command({ kind: 'open', url: 'https://example.org', viewId: 'right' });
    const [left, right] = [pageAt(0), pageAt(1)];
    workspace.setLayout([
        { viewId: 'left', bounds, focused: false },
        { viewId: 'right', bounds: { ...bounds, x: 400 }, focused: true },
    ]);
    expect(workspace.hasActiveTab()).toBe(true);
    expect(workspace.pageAction('reload')).toBe(true);
    expect(workspace.pageAction('zoom-in')).toBe(true);
    workspace.command({ kind: 'navigate', action: 'hard-reload' });
    workspace.command({ kind: 'navigate', action: 'reload', id: 'left' });
    expect(right.calls).toEqual(['reload', 'reloadIgnoringCache']);
    expect(left.calls).toEqual(['reload']);
    expect(workspace.snapshot().tabs[1].zoomFactor).toBe(1.1);
    // With no focused web page (a chat in the focused pane), page actions do nothing.
    workspace.setLayout([{ viewId: 'left', bounds, focused: false }]);
    expect(workspace.hasActiveTab()).toBe(false);
    expect(workspace.pageAction('reload')).toBe(false);
    expect(() => workspace.command({ kind: 'navigate', action: 'reload' })).toThrow();
});

test('find reports match counts per view until the session stops', () => {
    const { workspace, pageAt } = fixture();
    workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'one' });
    const contents = pageAt(0);
    const id = 'one';
    workspace.command({ kind: 'find', id, text: 'haus', forward: true, newSession: true });
    expect(workspace.snapshot().tabs[0].find).toEqual({ activeMatch: 0, matches: 0 });
    contents.emit('found-in-page', {}, { activeMatchOrdinal: 1, matches: 4 });
    expect(workspace.snapshot().tabs[0].find).toEqual({ activeMatch: 1, matches: 4 });
    workspace.command({ kind: 'stop-find', id });
    contents.emit('found-in-page', {}, { activeMatchOrdinal: 2, matches: 4 });
    expect(workspace.snapshot().tabs[0].find).toBeNull();
    expect(() => workspace.command({ kind: 'find', id: 'gone', text: 'x' })).toThrow();
    workspace.command({ kind: 'stop-find', id: 'gone' });
});

test('Open Link in New Tab from the page menu asks for a background tab', () => {
    const { workspace, pageAt, page, window } = fixture();
    workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'one' });
    pageAt(0).emit('context-menu', {}, { linkURL: 'https://example.org' });
    expect(page.menus[0].map((item) => item.label)).toEqual([
        'Open Link in New Tab',
        'Open Link in Default Browser',
        'Copy Link Address',
    ]);
    page.menus[0][0].click();
    expect(openRequests(window)).toEqual([
        { url: 'https://example.org/', openerId: 'one', background: true },
    ]);
});

test('keys pressed in a page act on that page and forward tab actions to the App', () => {
    const { workspace, pageAt, window } = fixture();
    workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'left' });
    workspace.command({ kind: 'open', url: 'https://example.org', viewId: 'right' });
    // The App still has the right pane focused; the left page has key focus.
    workspace.setLayout([
        { viewId: 'left', bounds, focused: false },
        { viewId: 'right', bounds: { ...bounds, x: 400 }, focused: true },
    ]);
    const [left, right] = [pageAt(0), pageAt(1)];
    const press = (input) => left.emit('before-input-event', { preventDefault: noop }, input);
    const command = process.platform === 'darwin' ? { meta: true } : { control: true };
    press({ type: 'keyDown', key: 'r', ...command });
    press({ type: 'keyDown', key: '=', ...command });
    press({ type: 'keyDown', key: 'f', ...command });
    press({ type: 'keyDown', key: 'T', ...command, shift: true });
    press({ type: 'keyDown', key: 'B', ...command, shift: true });
    expect(left.calls).toContain('reload');
    expect(left.zoomFactor).toBe(1.1);
    expect(right.calls).toEqual([]);
    expect(window.webContents.zoomLevel).toBe(0);
    const shortcuts = window.webContents.sent
        .filter(([channel]) => channel === 'desktop:browser:shortcut')
        .map(([, action]) => action);
    expect(shortcuts).toEqual(['find', 'reopen-tab']);
});
