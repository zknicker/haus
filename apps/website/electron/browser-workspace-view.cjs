'use strict';

const { installBrowserShortcuts } = require('./browser-shortcuts.cjs');
const { installBrowserPageLinks } = require('./browser-page-links.cjs');
const { installBrowserPageMenu } = require('./browser-page-menu.cjs');
const { trackBrowserTabState } = require('./browser-tab-state.cjs');

/**
 * Creates one web view, hidden until the App places it, and wires its page:
 * published state, links and popups (which ask the App for a new tab), the
 * context menu, page-focused shortcuts, key focus, and the page closing itself
 * (`window.close()`). `webContents` is a popup page Chromium already created
 * and is loading; without it the view makes its own page and `entry.load()`
 * loads `url`.
 *
 * Every page listener reaches its window through `entry.host`, never a
 * captured window, so a view dragged to another window (`browser-workspace.cjs`
 * `adopt`) keeps its live page and history and answers to its new window once
 * that workspace swaps `host`. A host is `{ window, isLive(entry), publish(),
 * requestOpen(url, options), openPopup(url, options), runShortcut(action),
 * onFocus(), onClosed(entry) }`.
 */
function createBrowserView(host, url, { WebContentsView, browserSession, page, webContents }) {
    const view = new WebContentsView(
        webContents
            ? { webContents }
            : {
                  webPreferences: {
                      session: browserSession,
                      nodeIntegration: false,
                      contextIsolation: true,
                      sandbox: true,
                      webSecurity: true,
                  },
              }
    );
    view.setVisible(false);
    const state = {
        url,
        title: new URL(url).hostname,
        faviconUrl: null,
        loading: true,
        error: null,
        canGoBack: false,
        canGoForward: false,
        zoomFactor: 1,
        find: null,
    };
    const contents = view.webContents;
    const entry = { host, view, state, load: () => undefined };
    const publish = () => entry.host.publish();
    const openTab = (target, options) => entry.host.requestOpen(target, options);
    installBrowserShortcuts(contents, (action) => entry.host.runShortcut(action));
    trackBrowserTabState(contents, state, {
        fallbackUrl: url,
        isLive: () => entry.host.isLive(entry),
        publish,
    });
    installBrowserPageLinks(contents, {
        openExternal: page.openExternal,
        openPopup: (target, options) => entry.host.openPopup(target, options),
        openTab,
        onNavigate: () => {
            state.error = null;
        },
    });
    installBrowserPageMenu(contents, () => entry.host.window, { ...page, openTab });
    contents.on('focus', () => entry.host.onFocus());
    // A page's own window.close() destroys it; its view must leave with it.
    contents.once('destroyed', () => entry.host.onClosed(entry));
    if (webContents) {
        return entry;
    }
    entry.load = () =>
        contents.loadURL(url).catch((error) => {
            if (entry.host.isLive(entry) && error.code !== 'ERR_ABORTED') {
                state.error = error.message;
                state.loading = false;
                publish();
            }
        });
    return entry;
}

module.exports = { createBrowserView };
