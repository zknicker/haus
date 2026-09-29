'use strict';

const { assertTrustedRenderer } = require('./trusted-renderer.cjs');
const { createBrowserWorkspace } = require('./browser-workspace.cjs');

function registerBrowserWorkspace({ appUrl, BrowserWindow, WebContentsView, ipcMain, session }) {
    const workspaces = new WeakMap();
    const browserSession = session.fromPartition('persist:haus-browser');
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false)
    );
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.on('will-download', (event) => event.preventDefault());
    const attach = (window) => {
        const workspace = createBrowserWorkspace(window, { WebContentsView, browserSession });
        workspaces.set(window, workspace);
        return workspace;
    };
    const forSender = (event) => {
        assertTrustedRenderer(event, appUrl);
        const window = BrowserWindow.fromWebContents(event.sender);
        // Origin alone is insufficient: a browser page may visit the App origin.
        if (
            !window ||
            window.webContents !== event.sender ||
            event.senderFrame !== event.sender.mainFrame
        ) {
            throw new Error('Only the Haus App can control browser tabs.');
        }
        const workspace = workspaces.get(window);
        if (!workspace) {
            throw new Error('Browser workspace is unavailable.');
        }
        return workspace;
    };
    ipcMain.handle('desktop:browser:command', (event, command) =>
        forSender(event).command(command)
    );
    ipcMain.handle('desktop:browser:snapshot', (event) => forSender(event).snapshot());
    ipcMain.handle('desktop:browser:bounds', (event, bounds) => forSender(event).setBounds(bounds));
    return { attach };
}

module.exports = { registerBrowserWorkspace };
