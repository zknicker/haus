'use strict';

const { captureBrowserPage } = require('./browser-capture.cjs');
const { reorderBrowserTabs } = require('./browser-tab-order.cjs');
const { installBrowserShortcuts } = require('./browser-shortcuts.cjs');
const { browserUrl } = require('./browser-url.cjs');
const { findInPage, runPageAction, stopFindInPage } = require('./browser-page-actions.cjs');
const { installBrowserPageLinks } = require('./browser-page-links.cjs');
const { installBrowserPageMenu } = require('./browser-page-menu.cjs');
const { trackBrowserTabState } = require('./browser-tab-state.cjs');
const { runBrowserWindowAction } = require('./browser-window-actions.cjs');
const { randomUUID } = require('node:crypto');

/**
 * `page` carries the page-facing Electron services: `Menu` and `clipboard` for
 * the context menu, `openExternal` for mail links, and `inspect` (development
 * builds only) for Inspect Element.
 */
function createBrowserWorkspace(window, { WebContentsView, browserSession, page }) {
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
                // Follows the shell card's corner (Canvas and Band window layouts); 0 is square.
                tab.view.setBorderRadius(Math.round((bounds.radius ?? 0) * zoom));
            }
        }
    };
    /**
     * Asks the App to show the selected page a link re-opened, a change no App
     * selection shows. Mere page focus reveals nothing: the App may show another tab.
     */
    const reveal = () => {
        if (!window.webContents.isDestroyed()) {
            window.webContents.send('desktop:browser:reveal');
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
    /** A background tab (⌘-click, Open Link in New Tab) opens without taking the selection. */
    const open = (value, { blank = false, background = false } = {}) => {
        const url = blank ? 'about:blank' : browserUrl(value);
        const existing = !blank && [...tabs].find(([, tab]) => tab.state.url === url);
        if (existing) {
            if (!background) {
                select(existing[0]);
                reveal();
            }
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
                faviconUrl: null,
                loading: true,
                error: null,
                canGoBack: false,
                canGoForward: false,
                zoomFactor: 1,
                find: null,
            },
        };
        tabs.set(id, tab);
        window.contentView.addChildView(view);
        const contents = view.webContents;
        installBrowserShortcuts(contents, (action) => runBrowserWindowAction(window, api, action));
        trackBrowserTabState(contents, tab.state, {
            fallbackUrl: url,
            isLive: () => tabs.has(id),
            publish,
        });
        const openTab = (target, options) => {
            try {
                open(target, options);
            } catch (error) {
                tab.state.error = error.message;
                publish();
            }
        };
        installBrowserPageLinks(contents, {
            openExternal: page.openExternal,
            openTab,
            onNavigate: () => {
                tab.state.error = null;
            },
        });
        installBrowserPageMenu(contents, window, { ...page, openTab });
        if (background) {
            layout();
            publish();
        } else {
            select(id);
        }
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
        // Closing the focused page would leave App shortcuts dead until a click.
        const hadFocus = tab.view.webContents.isFocused();
        window.contentView.removeChildView(tab.view);
        tabs.delete(id);
        tab.view.webContents.close();
        if (hadFocus && !window.webContents.isDestroyed()) {
            window.webContents.focus();
        }
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
    const activeTab = () => {
        const tab = tabs.get(activeId);
        if (!tab) {
            throw new Error('Select a browser tab first.');
        }
        return tab;
    };
    const pageTab = (id) => {
        const tab = tabs.get(id);
        if (!tab) {
            throw new Error('Browser tab no longer exists.');
        }
        return tab;
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
                open(null, { blank: true });
                break;
            case 'open':
                open(input.url);
                break;
            case 'find': {
                const tab = pageTab(input.id);
                findInPage(tab.view.webContents, tab.state, input);
                break;
            }
            case 'stop-find': {
                const tab = tabs.get(input.id);
                if (tab && !tab.view.webContents.isDestroyed()) {
                    stopFindInPage(tab.view.webContents, tab.state, publish);
                }
                break;
            }
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
            case 'navigate': {
                const tab = activeTab();
                runPageAction(tab.view.webContents, tab.state, input, publish);
                break;
            }
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
                ) &&
                (value.radius === undefined || (Number.isFinite(value.radius) && value.radius >= 0))
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
    const api = {
        capture: (id) => captureBrowserPage(tabs.get(id), () => activeId === id && bounds !== null),
        command,
        open: (value) => {
            if (!mounted) {
                throw new Error('Browser workspace is not mounted.');
            }
            open(value);
        },
        /**
         * True while the selected tab's page is on screen. The App keeps a
         * selected tab while hiding its page (a hidden side pane, the primary
         * tab over it) by reporting no bounds; page shortcuts then do nothing.
         */
        hasActiveTab: () => activeId !== null && bounds !== null,
        /** Runs a page action on the shown tab; false when no browser page is shown. */
        pageAction: (action) => {
            const tab = bounds === null ? undefined : tabs.get(activeId);
            if (!tab) {
                return false;
            }
            runPageAction(tab.view.webContents, tab.state, { action }, publish);
            return true;
        },
        setBounds,
        snapshot,
    };
    return api;
}

module.exports = { createBrowserWorkspace };
