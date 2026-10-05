'use strict';

// A fake Electron for tab-drag tests: two side-by-side App windows; never packaged.
const { EventEmitter } = require('node:events');
const { registerTabDrag } = require('./tab-drag-ipc.cjs');

const appUrl = 'https://haus.chat';
const titleBar = 28;

function fakeAppWindow(id, frame, { visible = true } = {}) {
    const window = new EventEmitter();
    const contents = new EventEmitter();
    Object.assign(contents, {
        destroyed: false,
        getZoomFactor: () => 1,
        isDestroyed: () => contents.destroyed,
        mainFrame: { frameTreeNodeId: id, url: `${appUrl}/s/acme` },
        send: (channel, value) => contents.sent.push([channel, value]),
        sent: [],
    });
    Object.assign(window, {
        closed: false,
        focused: false,
        frame: { ...frame },
        id,
        opacity: 1,
        visible,
        webContents: contents,
        close: () => {
            window.closed = true;
            window.emit('closed');
        },
        focus: () => {
            window.focused = true;
        },
        getBounds: () => ({ ...window.frame }),
        getContentBounds: () => ({
            ...window.frame,
            y: window.frame.y + titleBar,
            height: window.frame.height - titleBar,
        }),
        hide: () => {
            window.visible = false;
        },
        isDestroyed: () => window.closed,
        isMinimized: () => false,
        isVisible: () => window.visible,
        moveTop: () => {
            window.movedTop += 1;
        },
        movedTop: 0,
        setBounds: (bounds) => {
            window.frame = { ...bounds };
        },
        setOpacity: (value) => {
            window.opacity = value;
        },
        show: () => {
            window.visible = true;
        },
        showInactive: () => {
            window.visible = true;
        },
    });
    return window;
}

/** `platform`: the OS; `active`: whether Haus is the active app (a focused window exists). */
function harness({ active = true, platform = 'darwin' } = {}) {
    const handlers = new Map();
    const listeners = new Map();
    const app = Object.assign(new EventEmitter(), {
        focus: (options) => app.focusCalls.push(options),
        focusCalls: [],
    });
    const windows = [];
    const cursor = { x: 0, y: 0 };
    const transfers = [];
    /** Windows at their web view limit (`'*'`: every window): transfers into them are refused. */
    const full = new Set();
    const opened = [];
    const ticks = new Set();
    const deferred = [];
    /** Sends and transfers in the order Electron made them: `['send', windowId, kind]`, `['transfer', from, to]`. */
    const timeline = [];
    const add = (window) => {
        const send = window.webContents.send;
        window.webContents.send = (channel, value) => {
            timeline.push(['send', window.id, value?.kind]);
            send(channel, value);
        };
        windows.push(window);
        window.once('closed', () => windows.splice(windows.indexOf(window), 1));
        app.emit('browser-window-created', {}, window);
        return window;
    };
    const drag = registerTabDrag({
        app,
        appUrl,
        BrowserWindow: {
            fromWebContents: (contents) =>
                windows.find((window) => window.webContents === contents),
            getAllWindows: () => [...windows],
            getFocusedWindow: () => (active ? windows[0] : null),
        },
        browserWorkspaces: {
            canTransfer: (_from, to) => !(full.has(to) || full.has('*')),
            transfer: (from, to, ids, shown) => {
                timeline.push(['transfer', from.id, to.id]);
                transfers.push(shown ? [from.id, to.id, ids, shown] : [from.id, to.id, ids]);
            },
        },
        ipcMain: {
            handle: (name, handler) => handlers.set(name, handler),
            on: (name, handler) => listeners.set(name, handler),
        },
        openWindow: (options) => {
            opened.push(options);
            return add(fakeAppWindow(10 + opened.length, options.bounds, { visible: false }));
        },
        platform,
        screen: { getCursorScreenPoint: () => ({ ...cursor }) },
        timers: {
            clearInterval: (run) => ticks.delete(run),
            setImmediate: (run) => deferred.push(run),
            setInterval: (run) => {
                ticks.add(run);
                return run;
            },
        },
    });
    const from = (window) => ({
        sender: window.webContents,
        senderFrame: { ...window.webContents.mainFrame },
    });
    const call = (name, window, value) => handlers.get(name)(from(window), value);
    const claim = (window, serverId = 'acme') => {
        const event = from(window);
        listeners.get('desktop:tab-drag:claim')(event, serverId);
        return event.returnValue;
    };
    const tick = () => {
        for (const run of [...ticks]) {
            run();
        }
    };
    const flush = () => {
        for (const run of deferred.splice(0)) {
            run();
        }
    };
    const messages = (window) =>
        window.webContents.sent
            .filter(([channel]) => channel === 'desktop:tab-drag:event')
            .map(([, m]) => m);
    // Each band: 44px tall across the top of the content, from x=240.
    const report = (window) =>
        call('desktop:tab-strip:report', window, {
            rect: { height: 44, width: 900, x: 240, y: 0 },
            serverId: 'acme',
        });
    const left = add(fakeAppWindow(1, { height: 800, width: 1200, x: 0, y: 0 }));
    const right = add(fakeAppWindow(2, { height: 800, width: 1200, x: 1300, y: 0 }));
    report(left);
    report(right);
    return {
        add,
        app,
        call,
        claim,
        cursor,
        drag,
        flush,
        full,
        left,
        messages,
        opened,
        report,
        right,
        tick,
        ticks,
        timeline,
        transfers,
        windows,
    };
}

const webTab = {
    history: {
        entries: [
            { key: 'k1', location: { kind: 'app', path: '/s/acme/inbox' }, pageState: {} },
            {
                key: 'k2',
                location: { kind: 'browser', title: 'x', url: 'https://x.test', viewId: 'v1' },
                pageState: {},
            },
        ],
        index: 1,
    },
    id: 'tab-1',
};

const webBundle = { activeTabId: webTab.id, tabs: [webTab] };

const startDrag = { bundle: webBundle, route: '/s/acme/inbox', serverId: 'acme' };

function detachRequest(keepsWindow = false, extra = {}) {
    return {
        bundle: webBundle,
        grab: { x: 20, y: 10 },
        keepsWindow,
        slot: { x: 248, y: 6 },
        ...extra,
    };
}

/** The left window's tab, torn off into a new floating window (id 11) at (300, 300). */
function tornOff() {
    const h = harness();
    h.call('desktop:tab-drag:start', h.left, startDrag);
    h.cursor.x = 300;
    h.cursor.y = 300;
    const reply = h.call('desktop:tab-drag:detach', h.left, detachRequest());
    const floating = h.windows.find((window) => window.id === 11);
    return { ...h, floating, reply };
}

module.exports = {
    detachRequest,
    fakeAppWindow,
    harness,
    startDrag,
    tornOff,
    webBundle,
    webTab,
};
