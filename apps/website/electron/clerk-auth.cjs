'use strict';

const path = require('node:path');
const { existsSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const { createLoopbackSsoCallback } = require('./clerk-loopback-callback.cjs');
const { isProviderAppDeeplink } = require('./provider-app-deeplinks.cjs');
const { assertTrustedRenderer, isTrustedRendererUrl } = require('./trusted-renderer.cjs');

const callbackChannel = 'desktop:auth:sso-callback';
const callbackMarker = 'sso-callback';
const protocolScheme = 'haus';
let memoryToken = null;

function registerClerkAuth({
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

    const hasLock = app.requestSingleInstanceLock();
    if (!hasLock) {
        app.quit();
        return false;
    }

    const loopbackCallback = createLoopbackSsoCallback((url) => {
        broadcastSsoCallback(url, webContents, appUrl);
    });

    app.on('open-url', (event, url) => {
        event.preventDefault();
        broadcastSsoCallback(url, webContents, appUrl);
    });

    app.on('second-instance', (_event, argv) => {
        const callbackUrl = argv.find(isSsoCallbackUrl);
        if (callbackUrl) {
            broadcastSsoCallback(callbackUrl, webContents, appUrl);
        }

        const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
        if (window) {
            if (window.isMinimized()) {
                window.restore();
            }
            window.show();
            window.focus();
        }
    });

    ipcMain.handle('desktop:auth:token-get', (event) => {
        assertTrustedRenderer(event, appUrl);
        return readToken(app, safeStorage);
    });
    ipcMain.handle('desktop:auth:token-set', (event, token) => {
        assertTrustedRenderer(event, appUrl);
        return writeToken(app, safeStorage, token);
    });
    ipcMain.handle('desktop:auth:sso-callback-prepare', async (event) => {
        assertTrustedRenderer(event, appUrl);
        return app.isPackaged ? 'haus://sso-callback' : await loopbackCallback.prepare();
    });
    ipcMain.handle('desktop:auth:sso-callback-cancel', async (event) => {
        assertTrustedRenderer(event, appUrl);
        await loopbackCallback.close();
    });
    ipcMain.handle('desktop:open-external', async (event, url) => {
        assertTrustedRenderer(event, appUrl);
        if (!(isExternalBrowserUrl(url) || isProviderAppDeeplink(url))) {
            throw new Error('Only HTTP(S) URLs and provider app deeplinks can open externally.');
        }
        // Rejects when no app handles the scheme; the renderer falls back on that.
        await shell.openExternal(url);
    });
    app.on('before-quit', () => {
        void loopbackCallback.close();
    });

    return true;
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

function broadcastSsoCallback(url, allWebContents, appUrl) {
    if (!isSsoCallbackUrl(url)) {
        return;
    }

    for (const contents of allWebContents.getAllWebContents()) {
        if (!contents.isDestroyed() && isTrustedRendererUrl(contents.getURL(), appUrl)) {
            contents.send(callbackChannel, url);
        }
    }
}

function isSsoCallbackUrl(value) {
    if (typeof value !== 'string' || !value.includes(callbackMarker)) {
        return false;
    }

    try {
        const url = new URL(value);
        return (
            url.protocol === `${protocolScheme}:` ||
            (url.protocol === 'http:' &&
                url.hostname === '127.0.0.1' &&
                /^\/sso-callback\/[a-f0-9]{48}$/u.test(url.pathname))
        );
    } catch {
        return false;
    }
}

function isExternalBrowserUrl(value) {
    if (typeof value !== 'string') {
        return false;
    }

    try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

function tokenPath(app) {
    return path.join(app.getPath('userData'), 'clerk-client-jwt.bin');
}

function readToken(app, safeStorage) {
    if (memoryToken) {
        return memoryToken;
    }

    if (!safeStorage.isEncryptionAvailable()) {
        return null;
    }

    const filePath = tokenPath(app);
    if (!existsSync(filePath)) {
        return null;
    }

    try {
        memoryToken = safeStorage.decryptString(readFileSync(filePath));
        return memoryToken;
    } catch (error) {
        console.error('[ClerkAuth] Could not read the encrypted client token.', error);
        return null;
    }
}

function writeToken(app, safeStorage, token) {
    if (!(token === null || typeof token === 'string')) {
        throw new TypeError('Clerk client token must be a string or null.');
    }

    memoryToken = token;
    const filePath = tokenPath(app);

    if (token === null) {
        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
        return;
    }

    if (safeStorage.isEncryptionAvailable()) {
        writeFileSync(filePath, safeStorage.encryptString(token));
    }
}

module.exports = { isExternalBrowserUrl, isSsoCallbackUrl, registerClerkAuth };
