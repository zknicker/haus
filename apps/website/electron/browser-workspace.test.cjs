'use strict';

const { EventEmitter } = require('node:events');
const { readdirSync } = require('node:fs');
const { describe, expect, test } = require('bun:test');
const { browserUrl } = require('./browser-url.cjs');
const { registerBrowserWorkspace } = require('./browser-workspace-ipc.cjs');
const { FakeContents, FakeView, fixture, page } = require('./browser-test-fakes.cjs');
const desktopBuild = require('../electron-builder.config.cjs');

test('desktop builds package every browser module and the extracted dock setup', () => {
    const modules = readdirSync(__dirname).filter(
        (name) => /^browser-.*\.cjs$/.test(name) && !/(\.test|-test-fakes)\.cjs$/.test(name)
    );
    expect(modules.length).toBeGreaterThan(10);
    for (const name of modules) {
        expect(desktopBuild.files).toContain(`electron/${name}`);
    }
    expect(desktopBuild.files).toContain('electron/development-dock-icon.cjs');
});

describe('desktop browser workspace', () => {
    test('accepts web addresses and rejects local files, scripts and embedded credentials', () => {
        expect(browserUrl('https://amazon.com/dp/B012345678')).toBe(
            'https://amazon.com/dp/B012345678'
        );
        for (const value of [
            'file:///etc/passwd',
            'javascript:alert(1)',
            'about:blank',
            'https://user:secret@example.com',
            {},
            null,
        ]) {
            expect(() => browserUrl(value)).toThrow();
        }
    });
    test('the App names each view; pages share a separate session with no App preload', () => {
        const { window, browserSession, workspace } = fixture();
        workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'one' });
        const view = [...window.children][0];
        expect(view.options.webPreferences).toEqual({
            session: browserSession,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        });
        expect(view.visible).toBe(false);
        // Re-opening a named view (a remounted tab page) keeps its live page.
        workspace.command({ kind: 'open', url: 'https://example.com/other', viewId: 'one' });
        expect(view.webContents.loads).toEqual(['https://example.com/']);
        // Views carry no selection of their own: the App owns every tab.
        expect(workspace.snapshot()).toEqual({
            tabs: [expect.objectContaining({ id: 'one', url: 'https://example.com/' })],
        });
        expect(() =>
            workspace.command({ kind: 'open', url: 'https://example.com', viewId: '../x' })
        ).toThrow('view id');
        expect(() => workspace.command({ kind: 'select', id: 'one' })).toThrow('Unknown');
    });
    test('the layout shows every placed view at once and hides the rest without reloading', () => {
        const { window, workspace } = fixture();
        open(workspace, 'https://example.com', 'left');
        open(workspace, 'https://example.org', 'right');
        open(workspace, 'https://example.net', 'hidden');
        const [left, right, hidden] = [...window.children];
        workspace.setLayout([
            place('left', { x: 200, y: 100, width: 300, height: 800 }),
            place('right', { x: 500, y: 100, width: 900, height: 600 }, true),
        ]);
        expect([left.visible, right.visible, hidden.visible]).toEqual([true, true, false]);
        expect(left.bounds).toEqual({ x: 200, y: 100, width: 300, height: 600 });
        expect(right.bounds).toEqual({ x: 500, y: 100, width: 500, height: 600 });
        workspace.setLayout([place('right', { x: 0, y: 40, width: 800, height: 600 })]);
        expect([left.visible, right.visible]).toEqual([false, true]);
        workspace.setLayout([]);
        expect(right.visible).toBe(false);
        for (const view of [left, right, hidden]) {
            expect(view.webContents.loads).toHaveLength(1);
            expect(view.webContents.closed).toBe(false);
        }
        // A view closed in the same tick it is placed is skipped, not an error.
        workspace.setLayout([place('gone', { x: 0, y: 0, width: 1, height: 1 })]);
    });
    test('malformed layouts fail at the bridge boundary', () => {
        const { workspace } = fixture();
        const bounds = { x: 0, y: 0, width: 1, height: 1 };
        for (const layout of [
            null,
            [place('a', { ...bounds, x: Number.NaN })],
            [place('a', { ...bounds, radius: -1 })],
            [place('a', bounds), place('a', bounds)],
            [place('a', bounds, true), place('b', bounds, true)],
            [{ viewId: 'a b', bounds, focused: false }],
        ]) {
            expect(() => workspace.setLayout(layout)).toThrow();
        }
        expect(() => workspace.command({ kind: 'unknown' })).toThrow();
    });
    test('placed pages follow the shell card corner, scaled with App zoom', () => {
        const { window, workspace } = fixture();
        open(workspace, 'https://example.com', 'one');
        const view = [...window.children][0];
        workspace.setLayout([place('one', { x: 0, y: 40, width: 800, height: 600 })]);
        expect(view.borderRadius).toBe(0);
        workspace.setLayout([place('one', { x: 8, y: 40, width: 800, height: 600, radius: 16.2 })]);
        expect(view.borderRadius).toBe(16);
        window.webContents.getZoomFactor = () => 1.5;
        workspace.setLayout([place('one', { x: 8, y: 40, width: 400, height: 300, radius: 16 })]);
        expect(view.borderRadius).toBe(24);
    });
    test('only a placed page can be captured', async () => {
        const { workspace } = fixture();
        open(workspace, 'https://example.com', 'one');
        open(workspace, 'https://example.org', 'two');
        expect(await workspace.capture('two')).toBeNull();
        workspace.setLayout([place('two', { x: 0, y: 40, width: 800, height: 600 })]);
        expect(await workspace.capture('one')).toBeNull();
        expect(await workspace.capture('two')).toStartWith('data:image/jpeg;base64,');
    });
    test('closing destroys a view; reset disposes every page and unmounts', () => {
        const { workspace, window } = fixture();
        open(workspace, 'https://example.com', 'one');
        open(workspace, 'https://example.org', 'two');
        expect(workspace.snapshot().tabs[1]).toMatchObject({
            title: 'example.org',
            url: 'https://example.org/',
        });
        const [first, second] = [...window.children];
        workspace.command({ kind: 'close', id: 'one' });
        expect(first.webContents.closed).toBe(true);
        expect(workspace.snapshot().tabs.map((tab) => tab.id)).toEqual(['two']);
        workspace.command({ kind: 'reset' });
        expect(second.webContents.closed).toBe(true);
        expect(window.children.size).toBe(0);
        expect(workspace.snapshot()).toEqual({ tabs: [] });
        expect(() => workspace.open('https://example.com')).toThrow('not mounted');
        expect(() =>
            workspace.command({ kind: 'open', url: 'https://example.com', viewId: 'x' })
        ).toThrow('Open a Server');
    });
    test('window destruction closes native pages without using the destroyed content view', () => {
        const { workspace, window } = fixture();
        open(workspace, 'https://example.com', 'one');
        const contents = [...window.children][0].webContents;
        window.contentView.removeChildView = () => {
            throw new Error('Window destroyed');
        };
        window.emit('closed');
        expect(contents.closed).toBe(true);
    });
    test('a page taking key focus reports its view so the App focuses its pane', () => {
        const { workspace, window } = fixture();
        open(workspace, 'https://example.com', 'one');
        window.webContents.sent = [];
        [...window.children][0].webContents.emit('focus');
        expect(window.webContents.sent).toEqual([['desktop:browser:focus', 'one']]);
    });
    test('closing the focused page hands focus back to the App', () => {
        const { workspace, window } = fixture();
        open(workspace, 'https://example.com', 'one');
        open(workspace, 'https://example.org', 'two');
        const [, secondView] = [...window.children];
        workspace.command({ kind: 'close', id: 'one' });
        expect(window.webContents.calls).toEqual([]);
        secondView.webContents.focus();
        workspace.command({ kind: 'close', id: 'two' });
        expect(window.webContents.calls).toEqual(['focus']);
    });
    test('popups and App-window links ask the App for a tab instead of opening a view', () => {
        const { workspace, window } = fixture();
        open(workspace, 'https://example.com', 'one');
        const contents = [...window.children][0].webContents;
        window.webContents.sent = [];
        expect(contents.popup({ url: 'https://example.com/login' })).toEqual({ action: 'deny' });
        workspace.open('https://example.org/app-link');
        workspace.command({ kind: 'open', url: 'https://example.net' });
        expect(window.webContents.sent).toEqual([
            [
                'desktop:browser:open-request',
                { url: 'https://example.com/login', openerId: 'one', background: false },
            ],
            [
                'desktop:browser:open-request',
                { url: 'https://example.org/app-link', openerId: null, background: false },
            ],
            [
                'desktop:browser:open-request',
                { url: 'https://example.net/', openerId: null, background: false },
            ],
        ]);
        expect(workspace.snapshot().tabs).toHaveLength(1);
        let blocked = false;
        contents.emit('will-redirect', { preventDefault: () => (blocked = true) }, 'file:///x');
        expect(blocked).toBe(true);
        contents.emit('did-fail-load', {}, -105, 'Name not resolved', 'https://example.com', true);
        expect(workspace.snapshot().tabs[0].error).toBe('Name not resolved');
    });
    test('views carry the page favicon, only as a web or inline image, until the next document', () => {
        const { workspace, window } = fixture();
        open(workspace, 'https://example.com', 'one');
        const contents = [...window.children][0].webContents;
        const favicon = () => workspace.snapshot().tabs[0].faviconUrl;
        contents.emit('page-favicon-updated', {}, [
            'file:///etc/icon.png',
            'https://example.com/favicon.ico',
        ]);
        expect(favicon()).toBe('https://example.com/favicon.ico');
        expect(window.webContents.state.tabs[0].faviconUrl).toBe('https://example.com/favicon.ico');
        contents.emit('did-navigate');
        expect(favicon()).toBeNull();
        contents.emit('page-favicon-updated', {}, ['javascript:alert(1)']);
        expect(favicon()).toBeNull();
    });
});

function open(workspace, url, viewId) {
    workspace.command({ kind: 'open', url, viewId });
}

function place(viewId, bounds, focused = false) {
    return { viewId, bounds, focused };
}

test('browser IPC authenticates the App main frame even when a page visits the App origin', () => {
    const handlers = new Map();
    const browserSession = new EventEmitter();
    browserSession.setPermissionRequestHandler = (handler) => {
        browserSession.request = handler;
    };
    browserSession.setPermissionCheckHandler = (handler) => {
        browserSession.check = handler;
    };
    const { window } = fixture();
    window.webContents.mainFrame = { frameTreeNodeId: 1, url: 'https://haus.chat/s/test' };
    // Electron hands each IPC a fresh frame object: match by frame id, never identity.
    const appFrame = () => ({ ...window.webContents.mainFrame });
    const registration = registerBrowserWorkspace({
        appUrl: 'https://haus.chat',
        BrowserWindow: { fromWebContents: () => window },
        WebContentsView: FakeView,
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        page: page(),
        session: { fromPartition: () => browserSession },
    });
    registration.attach(window);
    const command = handlers.get('desktop:browser:command');
    command({ sender: window.webContents, senderFrame: appFrame() }, { kind: 'mount' });
    expect(
        command(
            { sender: window.webContents, senderFrame: appFrame() },
            { kind: 'open', url: 'https://example.com', viewId: 'one' }
        ).tabs
    ).toHaveLength(1);
    expect(() =>
        command(
            { sender: new FakeContents(), senderFrame: { url: 'https://haus.chat' } },
            { kind: 'reset' }
        )
    ).toThrow();
    expect(() =>
        command(
            { sender: window.webContents, senderFrame: { url: 'https://haus.chat' } },
            { kind: 'reset' }
        )
    ).toThrow();
    expect(() =>
        command(
            {
                sender: window.webContents,
                senderFrame: { frameTreeNodeId: 2, url: 'https://haus.chat' },
            },
            { kind: 'reset' }
        )
    ).toThrow();
    expect(browserSession.check()).toBe(false);
    let allowed = true;
    browserSession.request({}, 'media', (value) => {
        allowed = value;
    });
    expect(allowed).toBe(false);
});
