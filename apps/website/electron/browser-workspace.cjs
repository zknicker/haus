'use strict';

const { reorderBrowserTabs } = require('./browser-tab-order.cjs');
const { installBrowserShortcuts } = require('./browser-shortcuts.cjs');
const { randomUUID } = require('node:crypto');

function browserUrl(value) {
    if (typeof value !== 'string') {
        throw new Error('Enter an HTTP or HTTPS address.');
    }
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Only HTTP and HTTPS pages can open in Haus.');
    }
    return url.href;
}

function createBrowserWorkspace(window, { WebContentsView, browserSession }) {
    const tabs = new Map();
    let activeId = null;
    let bounds = null;
    let mounted = false;
    const snapshot = () => ({
        activeId,
        tabs: [...tabs].map(([id, tab]) => ({ id, ...tab.state })),
    });
    const publish = () => {
        if (!window.webContents.isDestroyed()) {
            window.webContents.send('desktop:browser:state', snapshot());
        }
    };
    const layout = () => {
        const [width, height] = window.getContentSize();
        const zoom = window.webContents.getZoomFactor?.() ?? 1;
        for (const [id, tab] of tabs) {
            const visible = id === activeId && bounds !== null;
            tab.view.setVisible(visible);
            if (visible) {
                const x = Math.min(width, Math.max(0, Math.round(bounds.x * zoom)));
                const y = Math.min(height, Math.max(0, Math.round(bounds.y * zoom)));
                tab.view.setBounds({
                    x,
                    y,
                    width: Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom))),
                    height: Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom))),
                });
            }
        }
    };
    const select = (id) => {
        if (id !== null && !tabs.has(id)) {
            throw new Error('Browser tab no longer exists.');
        }
        activeId = id;
        layout();
        publish();
    };
    const open = (value, blank = false) => {
        const url = blank ? 'about:blank' : browserUrl(value);
        const existing = !blank && [...tabs].find(([, tab]) => tab.state.url === url);
        if (existing) {
            select(existing[0]);
            return;
        }
        if (tabs.size >= 20) {
            throw new Error('Close a browser tab before opening another.');
        }
        const id = randomUUID();
        const view = new WebContentsView({
            webPreferences: {
                session: browserSession,
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
            },
        });
        view.setVisible(false);
        const tab = {
            view,
            state: {
                url,
                title: blank ? 'New tab' : new URL(url).hostname,
                loading: true,
                error: null,
                canGoBack: false,
                canGoForward: false,
            },
        };
        tabs.set(id, tab);
        window.contentView.addChildView(view);
        const contents = view.webContents;
        installBrowserShortcuts(contents, window);
        const update = () => {
            if (!tabs.has(id) || contents.isDestroyed()) {
                return;
            }
            tab.state.url = contents.getURL() || url;
            tab.state.title =
                tab.state.url === 'about:blank'
                    ? 'New tab'
                    : contents.getTitle() || new URL(tab.state.url).hostname;
            tab.state.loading = contents.isLoading();
            tab.state.canGoBack = contents.navigationHistory.canGoBack();
            tab.state.canGoForward = contents.navigationHistory.canGoForward();
            publish();
        };
        for (const event of [
            'did-start-loading',
            'did-stop-loading',
            'did-navigate',
            'did-navigate-in-page',
            'page-title-updated',
        ]) {
            contents.on(event, update);
        }
        contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
            if (isMainFrame && code !== -3) {
                tab.state.error = description;
                update();
            }
        });
        contents.on('render-process-gone', () => {
            tab.state.error = 'This page stopped responding. Reload to try again.';
            tab.state.loading = false;
            publish();
        });
        const guardNavigation = (event, target) => {
            try {
                browserUrl(target);
                tab.state.error = null;
            } catch {
                event.preventDefault();
            }
        };
        contents.on('will-navigate', guardNavigation);
        contents.on('will-redirect', guardNavigation);
        contents.setWindowOpenHandler(({ url: target }) => {
            try {
                open(target);
            } catch (error) {
                tab.state.error = error.message;
                publish();
            }
            return { action: 'deny' };
        });
        select(id);
        void contents.loadURL(url).catch((error) => {
            if (tabs.has(id) && error.code !== 'ERR_ABORTED') {
                tab.state.error = error.message;
                tab.state.loading = false;
                publish();
            }
        });
    };
    const close = (id) => {
        const tab = tabs.get(id);
        if (!tab) {
            return;
        }
        window.contentView.removeChildView(tab.view);
        tabs.delete(id);
        tab.view.webContents.close();
        if (activeId === id) {
            activeId = [...tabs.keys()].at(-1) ?? null;
        }
        layout();
        publish();
    };
    const reset = () => {
        mounted = false;
        for (const id of [...tabs.keys()]) {
            close(id);
        }
        bounds = null;
    };
    const navigate = (input) => {
        const tab = tabs.get(activeId);
        if (!tab) {
            throw new Error('Select a browser tab first.');
        }
        const contents = tab.view.webContents;
        switch (input.action) {
            case 'back':
                if (contents.navigationHistory.canGoBack()) {
                    contents.navigationHistory.goBack();
                }
                break;
            case 'forward':
                if (contents.navigationHistory.canGoForward()) {
                    contents.navigationHistory.goForward();
                }
                break;
            case 'stop':
                contents.stop();
                break;
            case 'reload':
                tab.state.error = null;
                contents.reload();
                break;
            case 'url': {
                const target = browserUrl(input.url);
                tab.state.error = null;
                void contents.loadURL(target).catch((error) => {
                    if (contents.isDestroyed() || error.code === 'ERR_ABORTED') {
                        return;
                    }
                    tab.state.error = error.message;
                    publish();
                });
                break;
            }
            default:
                throw new Error('Unknown browser navigation action.');
        }
    };
    const command = (input) => {
        if (!mounted && ['open', 'new'].includes(input?.kind)) {
            throw new Error('Open a Server before opening browser tabs.');
        }
        switch (input?.kind) {
            case 'mount':
                mounted = true;
                break;
            case 'new':
                open(null, true);
                break;
            case 'open':
                open(input.url);
                break;
            case 'reorder':
                reorderBrowserTabs(tabs, input.ids);
                publish();
                break;
            case 'select':
                select(input.id);
                break;
            case 'close':
                close(input.id);
                break;
            case 'reset':
                reset();
                break;
            case 'navigate':
                navigate(input);
                break;
            default:
                throw new Error('Unknown browser command.');
        }
        return snapshot();
    };
    const setBounds = (value) => {
        if (
            value !== null &&
            !(
                value &&
                ['x', 'y', 'width', 'height'].every(
                    (key) => Number.isFinite(value[key]) && value[key] >= 0
                )
            )
        ) {
            throw new Error('Invalid browser bounds.');
        }
        bounds = value;
        layout();
    };
    window.on('resize', layout);
    window.on('closed', () => {
        for (const tab of tabs.values()) {
            if (!tab.view.webContents.isDestroyed()) {
                tab.view.webContents.close();
            }
        }
        tabs.clear();
    });
    window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {
            mounted = false;
            activeId = null;
            bounds = null;
            layout();
        }
    });
    return {
        command,
        open: (value) => {
            if (!mounted) {
                throw new Error('Browser workspace is not mounted.');
            }
            open(value);
        },
        setBounds,
        snapshot,
    };
}

module.exports = { browserUrl, createBrowserWorkspace };
