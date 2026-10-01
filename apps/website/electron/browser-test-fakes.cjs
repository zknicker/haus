'use strict';

// Test doubles for Electron's WebContentsView pages; never packaged.
const { EventEmitter } = require('node:events');
const { createBrowserWorkspace } = require('./browser-workspace.cjs');

class FakeContents extends EventEmitter {
    url = '';
    title = '';
    closed = false;
    loading = false;
    zoomFactor = 1;
    zoomLevel = 0;
    calls = [];
    /** Every loadURL target, so tests can prove a page was never reloaded. */
    loads = [];
    navigationHistory = {
        canGoBack: () => false,
        canGoForward: () => false,
        goBack: () => this.calls.push('goBack'),
        goForward: () => this.calls.push('goForward'),
    };
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
    isCrashed() {
        return false;
    }
    async capturePage() {
        return { isEmpty: () => false, toJPEG: () => Buffer.from('page') };
    }
    async loadURL(url) {
        this.loads.push(url);
        this.url = url;
        this.emit('did-navigate');
    }
    setWindowOpenHandler(handler) {
        this.popup = handler;
    }
    close() {
        this.closed = true;
    }
    focus() {
        this.calls.push('focus');
    }
    reload() {
        this.reloaded = true;
        this.calls.push('reload');
    }
    reloadIgnoringCache() {
        this.calls.push('reloadIgnoringCache');
    }
    stop() {
        this.calls.push('stop');
    }
    getZoomFactor() {
        return this.zoomFactor;
    }
    setZoomFactor(value) {
        this.zoomFactor = value;
    }
    getZoomLevel() {
        return this.zoomLevel;
    }
    setZoomLevel(value) {
        this.zoomLevel = value;
    }
    findInPage(text, options) {
        this.calls.push(['findInPage', text, options]);
    }
    stopFindInPage(action) {
        this.calls.push(['stopFindInPage', action]);
    }
    send(channel, state, ...rest) {
        this.state = state;
        this.sent = [...(this.sent ?? []), [channel, state, ...rest]];
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
    setBorderRadius(value) {
        this.borderRadius = value;
    }
}

function page() {
    const opened = [];
    const menus = [];
    return {
        clipboard: { writeText: (value) => opened.push(['clipboard', value]) },
        inspect: false,
        Menu: {
            buildFromTemplate: (template) => ({ popup: () => menus.push(template) }),
        },
        menus,
        opened,
        openExternal: async (url) => {
            opened.push(['external', url]);
        },
    };
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
    const services = page();
    const workspace = createBrowserWorkspace(window, {
        WebContentsView: FakeView,
        browserSession,
        page: services,
    });
    workspace.command({ kind: 'mount' });
    const pageAt = (index) => [...window.children][index].webContents;
    return { window, browserSession, workspace, page: services, pageAt };
}

module.exports = { FakeContents, FakeView, fixture, page };
