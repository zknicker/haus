'use strict';

const { registerQueryCacheHandoff } = require('./query-cache-handoff.cjs');
const { assertTrustedRenderer } = require('./trusted-renderer.cjs');
const { showWindow } = require('./window-lifecycle.cjs');
const { isSafeWindowRoute } = require('./window-routing.cjs');

/**
 * The App's window commands: open a window on a route, close or focus its own,
 * and hand a booting window its opener's query cache. Returns the cache
 * handoff `createWindow` requests through.
 */
function registerWindowIpc({ app, appUrl, BrowserWindow, createWindow, ipcMain }) {
    const queryCache = registerQueryCacheHandoff({ appUrl, BrowserWindow, ipcMain });
    ipcMain.handle('desktop:window:open', (event, route) => {
        assertTrustedRenderer(event, appUrl);
        if (!isSafeWindowRoute(route)) {
            return;
        }

        createWindow({ opener: BrowserWindow.fromWebContents(event.sender), route });
    });

    ipcMain.handle('desktop:window:close', (event) => {
        assertTrustedRenderer(event, appUrl);
        BrowserWindow.fromWebContents(event.sender)?.close();
    });

    ipcMain.handle('desktop:window:focus', (event) => {
        assertTrustedRenderer(event, appUrl);
        showWindow(app, BrowserWindow.fromWebContents(event.sender));
    });
    return { queryCache };
}

module.exports = { registerWindowIpc };
