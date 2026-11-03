'use strict';

const path = require('node:path');
const { createNativeAuthManager } = require('./native-auth-manager.cjs');
const { createNativeAuthStore } = require('./native-auth-store.cjs');
const { isProviderAppDeeplink } = require('./provider-app-deeplinks.cjs');
const { assertTrustedRenderer, isTrustedRendererUrl } = require('./trusted-renderer.cjs');

const callbackChannel = 'desktop:auth:session';
const protocolScheme = 'haus';

function registerNativeAuth({
    app,
    appUrl,
    BrowserWindow,
    ipcMain,
    safeStorage,
    shell,
    webContents,
}) {
    if (app.isPackaged) {
        registerProtocolClient(app);
    }
    if (!app.requestSingleInstanceLock()) {
        app.quit();
        return null;
    }

    let queryCache = null;
    const broadcastSession = (session) => {
        for (const contents of webContents.getAllWebContents()) {
            if (!contents.isDestroyed() && isTrustedRendererUrl(contents.getURL(), appUrl)) {
                contents.send(callbackChannel, session);
            }
        }
    };
    const store = createNativeAuthStore({ app, safeStorage });
    const manager = createNativeAuthManager({
        appUrl,
        isPackaged: app.isPackaged,
        onSession: broadcastSession,
        onSessionChange: () => queryCache?.clear(),
        openExternal: (url) => shell.openExternal(url),
        store,
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        void manager.acceptCallback(url);
    });
    app.on('second-instance', (_event, argv) => {
        const callback = argv.find(isHausSsoCallback);
        if (!callback) {
            return;
        }
        void manager.acceptCallback(callback);
        const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
        if (window) {
            if (window.isMinimized()) {
                window.restore();
            }
            window.show();
            window.focus();
        }
    });
    app.on('before-quit', () => void manager.cancelSignIn());

    ipcMain.on('desktop:auth:session-peek', (event) => {
        assertTrustedRenderer(event, appUrl);
        event.returnValue = manager.currentSession();
    });
    ipcMain.handle('desktop:auth:initialize', (event) => {
        assertTrustedRenderer(event, appUrl);
        return manager.initialize();
    });
    ipcMain.handle('desktop:auth:refresh', (event) => {
        assertTrustedRenderer(event, appUrl);
        return manager.refresh();
    });
    ipcMain.handle('desktop:auth:sign-in', (event, options) => {
        assertTrustedRenderer(event, appUrl);
        return manager.signIn(options?.switchAccount === true);
    });
    ipcMain.handle('desktop:auth:sign-in-cancel', (event) => {
        assertTrustedRenderer(event, appUrl);
        return manager.cancelSignIn();
    });
    ipcMain.handle('desktop:auth:sign-out', (event) => {
        assertTrustedRenderer(event, appUrl);
        return manager.signOut();
    });
    ipcMain.handle('desktop:open-external', async (event, value) => {
        assertTrustedRenderer(event, appUrl);
        if (!(isExternalBrowserUrl(value) || isProviderAppDeeplink(value))) {
            throw new Error('Only HTTP(S) URLs and provider app deeplinks can open externally.');
        }
        await shell.openExternal(value);
    });

    return {
        manager,
        setQueryCacheHandoff(value) {
            queryCache = value;
        },
    };
}

function registerProtocolClient(app) {
    if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [
            path.resolve(process.argv[1]),
        ]);
        return;
    }
    app.setAsDefaultProtocolClient(protocolScheme);
}

function isHausSsoCallback(value) {
    if (typeof value !== 'string') {
        return false;
    }
    try {
        const url = new URL(value);
        return url.protocol === 'haus:' && url.hostname === 'sso-callback' && url.pathname === '';
    } catch {
        return false;
    }
}

function isExternalBrowserUrl(value) {
    if (typeof value !== 'string') {
        return false;
    }
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
        return false;
    }
}

module.exports = { isHausSsoCallback, registerNativeAuth };
