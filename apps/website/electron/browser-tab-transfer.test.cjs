'use strict';

const { EventEmitter } = require('node:events');
const { expect, test } = require('bun:test');
const { registerBrowserWorkspace } = require('./browser-workspace-ipc.cjs');
const { FakeContents, FakeView, page } = require('./browser-test-fakes.cjs');

function fakeWindow() {
    const window = new EventEmitter();
    window.webContents = new FakeContents();
    window.children = new Set();
    window.contentView = {
        addChildView: (view) => window.children.add(view),
        removeChildView: (view) => window.children.delete(view),
    };
    window.getContentSize = () => [1000, 700];
    return window;
}

function twoWindows() {
    const browserSession = new EventEmitter();
    browserSession.setPermissionRequestHandler = () => undefined;
    browserSession.setPermissionCheckHandler = () => undefined;
    const services = page();
    const registry = registerBrowserWorkspace({
        appUrl: 'https://haus.chat',
        BrowserWindow: { fromWebContents: () => null },
        WebContentsView: FakeView,
        ipcMain: { handle: () => undefined },
        page: services,
        session: { fromPartition: () => browserSession },
    });
    const from = fakeWindow();
    const to = fakeWindow();
    const source = registry.attach(from);
    const target = registry.attach(to);
    source.command({ kind: 'mount' });
    target.command({ kind: 'mount' });
    return { from, page: services, registry, source, target, to };
}

const sent = (window, channel) =>
    (window.webContents.sent ?? []).filter(([name]) => name === channel).map(([, value]) => value);

test('a dragged tab moves its live views to the other window without reloading', () => {
    const { from, registry, source, target, to } = twoWindows();
    source.command({ kind: 'open', url: 'https://example.com', viewId: 'a' });
    source.command({ kind: 'open', url: 'https://example.org', viewId: 'b' });
    const view = [...from.children][1];

    registry.transfer(from, to, ['b', 'missing']);

    expect(from.children.has(view)).toBe(false);
    expect(to.children.has(view)).toBe(true);
    expect(view.visible).toBe(false);
    expect(view.webContents.closed).toBe(false);
    expect(view.webContents.loads).toEqual(['https://example.org/']);
    expect(source.snapshot().tabs.map((tab) => tab.id)).toEqual(['a']);
    expect(target.snapshot().tabs.map((tab) => tab.id)).toEqual(['b']);
    // The App's later `open` for the same view finds it there and never reloads.
    target.command({ kind: 'open', url: 'https://example.org', viewId: 'b' });
    expect(view.webContents.loads).toHaveLength(1);
    // The old window's close for a view it no longer holds is a no-op.
    source.command({ kind: 'close', id: 'b' });
    expect(view.webContents.closed).toBe(false);
});

test('a moved page answers to its new window: state, focus, popups, and menus', () => {
    const { from, page: services, registry, source, to } = twoWindows();
    source.command({ kind: 'open', url: 'https://example.com', viewId: 'a' });
    const contents = [...from.children][0].webContents;
    registry.transfer(from, to, ['a']);
    from.webContents.sent = [];
    to.webContents.sent = [];

    contents.title = 'Example';
    contents.emit('page-title-updated');
    expect(sent(to, 'desktop:browser:state').at(-1).tabs[0].title).toBe('Example');

    contents.emit('focus');
    expect(sent(to, 'desktop:browser:focus')).toEqual(['a']);

    contents.popup({ url: 'https://example.net/', disposition: 'foreground-tab' });
    expect(sent(to, 'desktop:browser:open-request')).toEqual([
        { background: false, openerId: 'a', url: 'https://example.net/' },
    ]);

    const popups = [];
    services.Menu.buildFromTemplate = () => ({ popup: (options) => popups.push(options) });
    contents.emit('context-menu', {}, { linkURL: '' });
    expect(popups).toEqual([{ window: to }]);
    expect(from.webContents.sent).toEqual([]);
});

test('a moved page shows once its new window places it, and lives past the old window', () => {
    const { from, registry, source, target, to } = twoWindows();
    source.command({ kind: 'open', url: 'https://example.com', viewId: 'a' });
    const view = [...from.children][0];
    registry.transfer(from, to, ['a']);
    target.setLayout([
        { bounds: { height: 600, width: 800, x: 0, y: 80 }, focused: true, viewId: 'a' },
    ]);
    expect(view.visible).toBe(true);
    expect(target.hasActiveTab()).toBe(true);

    from.emit('closed');
    expect(view.webContents.closed).toBe(false);
    to.emit('closed');
    expect(view.webContents.closed).toBe(true);
    expect(source.snapshot().tabs).toEqual([]);
});

test('a torn-off page shows in its new window at once until that App places it', () => {
    const { from, registry, source, target, to } = twoWindows();
    source.command({ kind: 'open', url: 'https://example.com', viewId: 'a' });
    source.command({ kind: 'open', url: 'https://example.org', viewId: 'b' });
    const [viewA, viewB] = [...from.children];
    const bounds = { height: 600, radius: 10, width: 800, x: 200, y: 90 };

    registry.transfer(from, to, ['a', 'b'], { bounds, viewId: 'a' });

    expect(viewA.visible).toBe(true);
    expect(viewA.bounds).toEqual({ height: 600, width: 800, x: 200, y: 90 });
    expect(viewB.visible).toBe(false);
    expect(target.hasActiveTab()).toBe(false);
    // The new window's navigation start does not hide the page it is booting under.
    to.webContents.emit('did-start-navigation', {}, 'https://haus.chat/', false, true);
    expect(viewA.visible).toBe(true);
    // The App's first layout takes over: the same spot, then whatever it chooses.
    target.setLayout([
        { bounds: { height: 600, width: 800, x: 200, y: 90 }, focused: true, viewId: 'a' },
    ]);
    expect(viewA.visible).toBe(true);
    target.setLayout([]);
    expect(viewA.visible).toBe(false);
});

test('a page handed on before its window booted stops showing there', () => {
    const { from, registry, source, to } = twoWindows();
    const third = fakeWindow();
    registry.attach(third);
    source.command({ kind: 'open', url: 'https://example.com', viewId: 'a' });
    const view = [...from.children][0];
    registry.transfer(from, to, ['a'], {
        bounds: { height: 10, width: 10, x: 0, y: 0 },
        viewId: 'a',
    });
    registry.transfer(to, third, ['a']);
    expect(third.children.has(view)).toBe(true);
    expect(view.visible).toBe(false);
});
