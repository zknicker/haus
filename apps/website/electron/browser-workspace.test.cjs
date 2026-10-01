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
    test('pages share a separate session and carry no App preload or Node access', () => {
        const { window, browserSession, workspace } = fixture();
        workspace.open('https://example.com');
        const view = [...window.children][0];
        expect(view.options.webPreferences).toEqual({
            session: browserSession,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        });
        expect(view.visible).toBe(false);
        workspace.setBounds({ x: 200, y: 100, width: 900, height: 800 });
        expect(view.bounds).toEqual({ x: 200, y: 100, width: 800, height: 600 });
        expect(view.visible).toBe(true);
        workspace.command({ kind: 'select', id: null });
        expect(view.visible).toBe(false);
        expect(view.webContents.closed).toBe(false);
    });
    test('hiding, moving, and reselecting a page keeps its live page', () => {
        // The App hides a selected page (hidden side pane, the primary tab over it) with no
        // bounds and moves it (split ↔ expanded, a resize) with new bounds; neither reloads.
        const { window, workspace } = fixture();
        workspace.open('https://example.com');
        workspace.open('https://example.org');
        const [first, second] = workspace.snapshot().tabs.map((tab) => tab.id);
        const view = [...window.children][0];
        const contents = view.webContents;
        workspace.command({ kind: 'select', id: first });
        for (const bounds of [
            { x: 600, y: 40, width: 400, height: 600 },
            null,
            { x: 240, y: 40, width: 760, height: 600 },
            null,
            { x: 600, y: 40, width: 400, height: 600 },
        ]) {
            workspace.setBounds(bounds);
            expect(view.visible).toBe(bounds !== null);
        }
        workspace.command({ kind: 'select', id: null });
        workspace.command({ kind: 'select', id: second });
        workspace.command({ kind: 'select', id: first });
        expect(contents.loads).toEqual(['https://example.com/']);
        expect(contents.calls).toEqual([]);
        expect(contents.closed).toBe(false);
        expect(window.children.has(view)).toBe(true);
    });
    test('reopening a link reuses its tab and closing returns to another page or chat', () => {
        const { workspace, window } = fixture();
        workspace.open('https://example.com/one');
        workspace.open('https://example.com/two');
        workspace.open('https://example.com/one');
        expect(workspace.snapshot().tabs).toHaveLength(2);
        const first = workspace.snapshot().activeId;
        const firstView = [...window.children][0];
        workspace.command({ kind: 'close', id: first });
        expect(firstView.webContents.closed).toBe(true);
        expect(workspace.snapshot().activeId).toBe(workspace.snapshot().tabs[0].id);
        workspace.command({ kind: 'close', id: workspace.snapshot().activeId });
        expect(workspace.snapshot()).toEqual({ activeId: null, tabs: [] });
    });
    test('popups become tabs, while forbidden redirects cannot escape into privileged schemes', () => {
        const { workspace, window } = fixture();
        workspace.open('https://example.com');
        const contents = [...window.children][0].webContents;
        expect(contents.popup({ url: 'https://example.com/login' })).toEqual({ action: 'deny' });
        expect(workspace.snapshot().tabs).toHaveLength(2);
        let blocked = false;
        contents.emit(
            'will-redirect',
            {
                preventDefault: () => {
                    blocked = true;
                },
            },
            'file:///etc/passwd'
        );
        expect(blocked).toBe(true);
        contents.emit('did-fail-load', {}, -105, 'Name not resolved', 'https://example.com', true);
        expect(workspace.snapshot().tabs[0].error).toBe('Name not resolved');
    });
    test('tabs carry the page favicon, only as a web or inline image, until the next document', () => {
        const { workspace, window } = fixture();
        workspace.open('https://example.com');
        const contents = [...window.children][0].webContents;
        const favicon = () => workspace.snapshot().tabs[0].faviconUrl;
        expect(favicon()).toBeNull();
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
        contents.emit('page-favicon-updated', {}, ['data:image/png;base64,AAAA']);
        expect(favicon()).toBe('data:image/png;base64,AAAA');
    });
    test('a new tab starts blank and reset disposes every page', () => {
        const { workspace, window } = fixture();
        workspace.command({ kind: 'new' });
        expect(workspace.snapshot().tabs[0]).toMatchObject({
            title: 'New tab',
            url: 'about:blank',
        });
        const contents = [...window.children][0].webContents;
        workspace.command({ kind: 'new' });
        expect(workspace.snapshot().tabs).toHaveLength(2);
        expect(workspace.snapshot().tabs.every((tab) => tab.title === 'New tab')).toBe(true);
        workspace.command({ kind: 'reset' });
        expect(contents.closed).toBe(true);
        expect(window.children.size).toBe(0);
        expect(workspace.snapshot()).toEqual({ activeId: null, tabs: [] });
        expect(() => workspace.open('https://example.com')).toThrow('not mounted');
        expect(() => workspace.command({ kind: 'new' })).toThrow('Open a Server');
    });
    test('the shown page follows the shell card corner, scaled with App zoom', () => {
        const { window, workspace } = fixture();
        workspace.open('https://example.com');
        const view = [...window.children][0];
        workspace.setBounds({ x: 0, y: 40, width: 800, height: 600 });
        expect(view.borderRadius).toBe(0);
        workspace.setBounds({ x: 8, y: 40, width: 800, height: 600, radius: 16.2 });
        expect(view.borderRadius).toBe(16);
        window.webContents.getZoomFactor = () => 1.5;
        workspace.setBounds({ x: 8, y: 40, width: 400, height: 300, radius: 16 });
        expect(view.borderRadius).toBe(24);
        workspace.setBounds({ x: 0, y: 40, width: 800, height: 600 });
        expect(view.borderRadius).toBe(0);
    });
    test('invalid bounds and stale selections fail at the bridge boundary', () => {
        const { workspace } = fixture();
        expect(() => workspace.setBounds({ x: Number.NaN, y: 0, width: 1, height: 1 })).toThrow();
        expect(() =>
            workspace.setBounds({ x: 0, y: 0, width: 1, height: 1, radius: -1 })
        ).toThrow();
        expect(() => workspace.command({ kind: 'select', id: 'missing' })).toThrow();
        expect(() => workspace.command({ kind: 'unknown' })).toThrow();
    });
    test('only the shown active page can be captured', async () => {
        const { workspace } = fixture();
        workspace.open('https://example.com');
        workspace.open('https://example.org');
        const [first, second] = workspace.snapshot().tabs.map((tab) => tab.id);
        expect(await workspace.capture(second)).toBeNull();
        workspace.setBounds({ x: 0, y: 40, width: 800, height: 600 });
        expect(await workspace.capture(first)).toBeNull();
        expect(await workspace.capture(second)).toStartWith('data:image/jpeg;base64,');
    });
    test('window destruction closes native pages without using the destroyed content view', () => {
        const { workspace, window } = fixture();
        workspace.open('https://example.com');
        const contents = [...window.children][0].webContents;
        window.contentView.removeChildView = () => {
            throw new Error('Window destroyed');
        };
        window.emit('closed');
        expect(contents.closed).toBe(true);
    });
    test('a page taking keyboard focus tells the App', () => {
        const { workspace, window } = fixture();
        workspace.open('https://example.com');
        window.webContents.sent = [];
        [...window.children][0].webContents.emit('focus');
        expect(window.webContents.sent).toEqual([['desktop:browser:focus', undefined]]);
    });
});

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
    window.webContents.mainFrame = { url: 'https://haus.chat/s/test' };
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
    command(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        { kind: 'mount' }
    );
    expect(
        command(
            { sender: window.webContents, senderFrame: window.webContents.mainFrame },
            { kind: 'new' }
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
    expect(browserSession.check()).toBe(false);
    let allowed = true;
    browserSession.request({}, 'media', (value) => {
        allowed = value;
    });
    expect(allowed).toBe(false);
});
