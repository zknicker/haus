'use strict';

const { EventEmitter } = require('node:events');
const { describe, expect, test } = require('bun:test');
const { browserUrl, createBrowserWorkspace } = require('./browser-workspace.cjs');
const { registerBrowserWorkspace } = require('./browser-workspace-ipc.cjs');
const desktopBuild = require('../electron-builder.config.cjs');

test('desktop builds package every browser module and the extracted dock setup', () => {
    expect(desktopBuild.files).toContain('electron/browser-workspace.cjs');
    expect(desktopBuild.files).toContain('electron/browser-workspace-ipc.cjs');
    expect(desktopBuild.files).toContain('electron/development-dock-icon.cjs');
});

class FakeContents extends EventEmitter {
    url = '';
    title = '';
    closed = false;
    loading = false;
    navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    getURL() {
        return this.url;
    }
    getTitle() {
        return this.title;
    }
    isDestroyed() {
        return this.closed;
    }
    isLoading() {
        return this.loading;
    }
    async loadURL(url) {
        this.url = url;
        this.emit('did-navigate');
    }
    setWindowOpenHandler(handler) {
        this.popup = handler;
    }
    close() {
        this.closed = true;
    }
    reload() {
        this.reloaded = true;
    }
    send(_channel, state) {
        this.state = state;
    }
}
class FakeView {
    constructor(options) {
        this.options = options;
        this.webContents = new FakeContents();
    }
    setVisible(value) {
        this.visible = value;
    }
    setBounds(value) {
        this.bounds = value;
    }
}
function fixture() {
    const window = new EventEmitter();
    window.webContents = new FakeContents();
    window.children = new Set();
    window.contentView = {
        addChildView: (view) => window.children.add(view),
        removeChildView: (view) => window.children.delete(view),
    };
    window.getContentSize = () => [1000, 700];
    const browserSession = {};
    const workspace = createBrowserWorkspace(window, { WebContentsView: FakeView, browserSession });
    workspace.command({ kind: 'mount' });
    return {
        window,
        browserSession,
        workspace,
    };
}

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
    test('invalid bounds and stale selections fail at the bridge boundary', () => {
        const { workspace } = fixture();
        expect(() => workspace.setBounds({ x: Number.NaN, y: 0, width: 1, height: 1 })).toThrow();
        expect(() => workspace.command({ kind: 'select', id: 'missing' })).toThrow();
        expect(() => workspace.command({ kind: 'unknown' })).toThrow();
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
