'use strict';

const {
    app,
    BrowserWindow,
    WebContentsView,
    clipboard,
    ipcMain,
    Menu,
    nativeTheme,
    safeStorage,
    screen,
    session,
    shell,
    webContents,
} = require('electron');
const path = require('node:path');
const { execFile } = require('node:child_process');
const electronUpdater = require('electron-updater');
const { registerClerkAuth } = require('./clerk-auth.cjs');
const { resolveClerkAuthOrigins } = require('./clerk-auth-origins.cjs');
const { registerNativeClerkRequestHeaders } = require('./clerk-native-requests.cjs');
const { registerEditContextMenuHandlers } = require('./edit-context-menu.cjs');
const { registerExternalLinkHandlers } = require('./external-link-handlers.cjs');
const { registerBrowserWorkspace } = require('./browser-workspace-ipc.cjs');
const { runBrowserWindowAction } = require('./browser-window-actions.cjs');
const { tabMenuItems, zoomMenuItems } = require('./browser-menu-items.cjs');
const { assertTrustedRenderer } = require('./trusted-renderer.cjs');
const { buildWindowUrl, isSafeWindowRoute, nextWindowBounds } = require('./window-routing.cjs');
const { readWindowState, resolveInitialBounds, writeWindowState } = require('./window-state.cjs');
const { hideLastWindowOnClose, markQuitting, showWindow } = require('./window-lifecycle.cjs');
const { forwardWindowSignals } = require('./window-signals.cjs');
const { installDevelopmentDockIcon } = require('./development-dock-icon.cjs');

// A broken stdout/stderr pipe (e.g. the dev launcher's reader went away, or a logging
// library writes after the pipe closed) must never crash the app with an uncaught EPIPE.
for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error) => {
        if (error.code !== 'EPIPE') {
            throw error;
        }
    });
}

const updateCheckIntervalMs = 10 * 60 * 1000;
const openDevtoolsMenuId = 'open-devtools';
const productionAppUrl = 'https://haus.chat';
// Centered exactly on the 44px window band (--app-shell-top-band-height in
// src/styles/default-theme.css), the midline the tabs and band actions share.
const macosTrafficLightPosition = { x: 16, y: 16 };
const { autoUpdater } = electronUpdater;
const useMockUpdater = !app.isPackaged && process.env.HAUS_ELECTRON_UPDATER_MOCK === '1';
const appUrl = app.isPackaged
    ? productionAppUrl
    : (process.env.HAUS_ELECTRON_DEV_URL ?? productionAppUrl);
const clerkAuthOrigins = resolveClerkAuthOrigins({
    appUrl,
    clerkIssuerUrl: process.env.HAUS_CLERK_ISSUER_URL,
    isPackaged: app.isPackaged,
});

const windows = new Set();
let mainWindow = null;
let updateCheckInterval = null;
let availableDesktopUpdateVersion = null;
let currentDesktopUpdateStatus = null;
let browserWorkspaces = null;
const newWindowOffsetPx = 36;
const minWindowWidth = 1100;
const minWindowHeight = 760;

if (process.env.HAUS_ELECTRON_DEV_URL) {
    const stackId = (process.env.HAUS_DEV_STACK_ID || 'default').replace(/[^a-zA-Z0-9._-]/gu, '-');
    app.setPath('userData', path.join(app.getPath('appData'), 'Haus Dev', stackId));
}

app.setName('Haus');
app.setAppUserModelId('chat.haus.desktop');

registerClerkAuth({ app, appUrl, BrowserWindow, ipcMain, safeStorage, shell, webContents });

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

if (process.env.HAUS_ELECTRON_UPDATE_FEED_URL) {
    autoUpdater.setFeedURL({
        provider: 'generic',
        url: process.env.HAUS_ELECTRON_UPDATE_FEED_URL,
    });
}

if (useMockUpdater) {
    autoUpdater.forceDevUpdateConfig = true;
}

function createWindow({ route, openerBounds } = {}) {
    const bounds = initialWindowBounds(openerBounds);
    const window = new BrowserWindow({
        title: 'Haus',
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        minWidth: minWindowWidth,
        minHeight: minWindowHeight,
        resizable: true,
        show: false,
        backgroundColor: '#00000000',
        transparent: process.platform === 'darwin',
        titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
        trafficLightPosition: process.platform === 'darwin' ? macosTrafficLightPosition : undefined,
        vibrancy: process.platform === 'darwin' ? 'menu' : undefined,
        // followWindow lets macOS dim the vibrancy material when the window
        // loses focus, matching native windows.
        visualEffectState: process.platform === 'darwin' ? 'followWindow' : undefined,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: false,
        },
    });

    windows.add(window);
    mainWindow ??= window;

    window.once('ready-to-show', () => {
        window.show();
    });

    forwardWindowSignals(window);

    window.webContents.on('did-finish-load', () => {
        if (currentDesktopUpdateStatus) {
            window.webContents.send('desktop:update:status', currentDesktopUpdateStatus);
        }
    });

    // Last interaction wins, so the app reopens where the user left it. The
    // end-of-operation events also cover force-quit, which skips 'close'.
    const persistBounds = () => {
        writeWindowState(windowStatePath(), window.getNormalBounds());
    };
    window.on('resized', persistBounds);
    window.on('moved', persistBounds);
    window.on('close', persistBounds);
    hideLastWindowOnClose(window, () => windows.size);

    window.on('closed', () => {
        windows.delete(window);

        if (mainWindow === window) {
            mainWindow = windows.values().next().value ?? null;
        }
    });

    const browserWorkspace = browserWorkspaces.attach(window);
    registerExternalLinkHandlers(window, {
        appUrl,
        openBrowser: (url) => browserWorkspace.open(url),
        openExternal: (url) => shell.openExternal(url),
    });

    void loadWindow(window, route);

    return window;
}

function windowStatePath() {
    return path.join(app.getPath('userData'), 'window-state.json');
}

/** New windows offset from their opener; the first window restores saved bounds. */
function initialWindowBounds(openerBounds) {
    const defaults = nextWindowBounds(openerBounds, { offset: newWindowOffsetPx });
    if (openerBounds) {
        return defaults;
    }

    return resolveInitialBounds(
        readWindowState(windowStatePath()),
        screen.getAllDisplays().map((display) => display.workArea),
        { minWidth: minWindowWidth, minHeight: minWindowHeight, defaults }
    );
}

async function loadWindow(window, route) {
    await window.loadURL(buildWindowUrl(appUrl, route));
}

function installAppMenu() {
    const template = [
        ...(process.platform === 'darwin'
            ? [
                  {
                      label: app.name,
                      submenu: [
                          { role: 'about' },
                          { type: 'separator' },
                          {
                              accelerator: 'CmdOrCtrl+,',
                              click: () => openSettingsWindow(),
                              label: 'Settings…',
                          },
                          { type: 'separator' },
                          { role: 'services' },
                          { type: 'separator' },
                          { role: 'hide' },
                          { role: 'hideOthers' },
                          { role: 'unhide' },
                          { type: 'separator' },
                          { role: 'quit' },
                      ],
                  },
              ]
            : []),
        {
            label: 'File',
            submenu: [
                {
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        const opener = BrowserWindow.getFocusedWindow();
                        createWindow({ openerBounds: opener?.getBounds() });
                    },
                    label: 'New Window',
                },
                ...tabMenuItems(runFocusedWindowAction),
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    // Finds in the selected browser page; otherwise opens Search.
                    accelerator: 'CmdOrCtrl+F',
                    click: () => runFocusedWindowAction('find'),
                    label: 'Find…',
                },
            ],
        },
        {
            label: 'View',
            submenu: [
                ...zoomMenuItems(runFocusedWindowAction),
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        {
            label: 'Go',
            submenu: [
                {
                    accelerator: 'CmdOrCtrl+[',
                    click: () => sendToFocusedWindow('desktop:window:history', 'back'),
                    label: 'Back',
                },
                {
                    accelerator: 'CmdOrCtrl+]',
                    click: () => sendToFocusedWindow('desktop:window:history', 'forward'),
                    label: 'Forward',
                },
            ],
        },
        { role: 'windowMenu' },
        {
            label: 'Developer',
            submenu: [
                {
                    accelerator: 'CmdOrCtrl+Alt+I',
                    click: () =>
                        (BrowserWindow.getFocusedWindow() ?? mainWindow)?.webContents.openDevTools({
                            mode: 'detach',
                        }),
                    id: openDevtoolsMenuId,
                    label: 'Open Web Inspector',
                },
                {
                    accelerator: 'CmdOrCtrl+Alt+D',
                    click: () => {
                        // Broadcast to every window and content view so all
                        // surfaces flip together; the renderer owns the state.
                        for (const contents of webContents.getAllWebContents()) {
                            contents.send('desktop:dev-mode:toggle');
                        }
                    },
                    id: 'toggle-dev-mode',
                    label: 'Toggle Dev Mode',
                },
            ],
        },
        {
            role: 'help',
            submenu: [
                {
                    click: () => shell.openExternal(productionAppUrl),
                    label: 'Haus Website',
                },
            ],
        },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Reveals the frontmost window (even one hidden by closing it) or a fresh one on Settings for ⌘,. */
function openSettingsWindow() {
    const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (!window) {
        createWindow({ route: '/settings' });
        return;
    }
    showWindow(app, window);
    window.webContents.send('desktop:settings:open');
}

/** Menu accelerators and page-focused keys share one action path per window. */
function runFocusedWindowAction(action) {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        runBrowserWindowAction(window, browserWorkspaces?.forWindow(window), action);
    }
}

function sendToFocusedWindow(channel, ...args) {
    BrowserWindow.getFocusedWindow()?.webContents.send(channel, ...args);
}

function registerIpcHandlers() {
    browserWorkspaces = registerBrowserWorkspace({
        appUrl,
        BrowserWindow,
        WebContentsView,
        ipcMain,
        page: {
            clipboard,
            inspect: !app.isPackaged,
            Menu,
            openExternal: (url) => shell.openExternal(url),
        },
        session,
    });
    registerEditContextMenuHandlers({ appUrl, ipcMain });

    ipcMain.handle('desktop:get-info', (event) => {
        assertTrustedRenderer(event, appUrl);
        return {
            isPackaged: app.isPackaged,
            platform: process.platform,
            version: app.getVersion(),
        };
    });

    ipcMain.handle('desktop:window:start-drag', (event) => {
        assertTrustedRenderer(event, appUrl);
    });

    ipcMain.handle('desktop:window:open', (event, route) => {
        assertTrustedRenderer(event, appUrl);
        if (!isSafeWindowRoute(route)) {
            return;
        }

        const opener = BrowserWindow.fromWebContents(event.sender);
        createWindow({ route, openerBounds: opener?.getBounds() });
    });

    ipcMain.handle('desktop:window:close', (event) => {
        assertTrustedRenderer(event, appUrl);
        BrowserWindow.fromWebContents(event.sender)?.close();
    });

    ipcMain.handle('desktop:window:focus', (event) => {
        assertTrustedRenderer(event, appUrl);
        showWindow(app, BrowserWindow.fromWebContents(event.sender));
    });

    ipcMain.handle('desktop:dock:set-badge', (event, count) => {
        assertTrustedRenderer(event, appUrl);
        if (!Number.isInteger(count) || count < 0) {
            return;
        }

        app.dock?.setBadge(count > 0 ? String(count) : '');
    });

    ipcMain.handle('desktop:window:set-theme', (event, theme) => {
        assertTrustedRenderer(event, appUrl);
        nativeTheme.themeSource = theme === 'dark' || theme === 'light' ? theme : 'system';
    });

    ipcMain.handle('desktop:update:check', async (event) => {
        assertTrustedRenderer(event, appUrl);
        await checkForUpdates();
    });

    ipcMain.handle('desktop:update:download', async (event) => {
        assertTrustedRenderer(event, appUrl);
        if (useMockUpdater) {
            await runMockUpdateDownload();
            return;
        }

        await autoUpdater.downloadUpdate();
    });

    ipcMain.handle('desktop:update:restart', (event) => {
        assertTrustedRenderer(event, appUrl);
        if (useMockUpdater) {
            sendUpdateStatus({ phase: 'restarting', version: '999.0.0' });
            return;
        }

        markQuitting();
        autoUpdater.quitAndInstall(false, true);
    });
}

function startUpdateMonitor() {
    if (useMockUpdater) {
        sendUpdateStatus({ phase: 'available', version: '999.0.0' });
        return;
    }

    if (!app.isPackaged) {
        sendUpdateStatus({ phase: 'unsupported' });
        return;
    }

    void checkForUpdates();
    updateCheckInterval = setInterval(() => {
        void checkForUpdates();
    }, updateCheckIntervalMs);
}

async function checkForUpdates() {
    // An active download or restart is canonical in the main process. Checks
    // must never regress it, while an available release remains re-checkable so
    // the interval can discover a superseding release.
    if (isDesktopUpdateInFlight(currentDesktopUpdateStatus)) {
        sendUpdateStatus(currentDesktopUpdateStatus);
        return;
    }

    if (useMockUpdater) {
        sendUpdateStatus({ phase: 'available', version: '999.0.0' });
        return;
    }

    sendUpdateStatus({ phase: 'checking' });

    try {
        const result = await autoUpdater.checkForUpdates();
        if (!result?.updateInfo) {
            sendUpdateStatus({ phase: 'current' });
        }
    } catch (error) {
        sendUpdateStatus({ message: getErrorMessage(error), phase: 'error' });
    }
}

async function runMockUpdateDownload() {
    for (const progress of [0.2, 0.55, 0.85, 1]) {
        sendUpdateStatus({ phase: 'downloading', progress, version: '999.0.0' });
        await new Promise((resolve) => setTimeout(resolve, 120));
    }

    sendUpdateStatus({ phase: 'ready', version: '999.0.0' });
}

autoUpdater.on('update-available', (updateInfo) => {
    availableDesktopUpdateVersion = updateInfo.version;
    sendUpdateStatus({ phase: 'available', version: updateInfo.version });
});

autoUpdater.on('update-not-available', () => {
    availableDesktopUpdateVersion = null;
    sendUpdateStatus({ phase: 'current' });
});

autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
        phase: 'downloading',
        progress: Math.max(0, Math.min(progress.percent / 100, 1)),
        version: availableDesktopUpdateVersion ?? app.getVersion(),
    });
});

autoUpdater.on('update-downloaded', (updateInfo) => {
    availableDesktopUpdateVersion = updateInfo.version;
    sendUpdateStatus({ phase: 'ready', version: updateInfo.version });
});

autoUpdater.on('error', (error) => {
    sendUpdateStatus({ message: getErrorMessage(error), phase: 'error' });
});

function sendUpdateStatus(status) {
    currentDesktopUpdateStatus = status;
    for (const window of windows) {
        window.webContents.send('desktop:update:status', status);
    }
}

function isDesktopUpdateInFlight(status) {
    return (
        status?.phase === 'downloading' ||
        status?.phase === 'ready' ||
        status?.phase === 'restarting'
    );
}

function cleanupDevPortsOnce() {
    if (app.isPackaged) {
        return;
    }

    for (const key of ['HAUS_WEBSITE_PORT']) {
        const port = readPort(key);
        if (port) {
            killProcessesListeningOnPort(port);
        }
    }
}

function readPort(key) {
    const value = Number.parseInt(process.env[key] ?? '', 10);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function killProcessesListeningOnPort(port) {
    execFile('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], (_error, stdout) => {
        for (const pid of stdout
            .toString()
            .split(/\s+/u)
            .map((value) => value.trim())
            .filter(Boolean)) {
            if (pid !== String(process.pid)) {
                process.kill(Number(pid), 'SIGTERM');
            }
        }
    });
}

function getErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string' && error) {
        return error;
    }

    return 'Haus could not check for updates.';
}

app.whenReady().then(() => {
    installDevelopmentDockIcon(app);
    registerNativeClerkRequestHeaders(
        session.defaultSession.webRequest,
        clerkAuthOrigins.clerkOrigin,
        clerkAuthOrigins.appOrigin
    );
    registerIpcHandlers();
    installAppMenu();
    createWindow();
    startUpdateMonitor();
});

app.on('window-all-closed', () => {
    // macOS apps keep running with no windows; the Dock icon reopens one.
    // Dev-port cleanup then waits for real quit (before-quit covers it).
    if (process.platform === 'darwin') {
        return;
    }

    cleanupDevPortsOnce();
    app.quit();
});

app.on('activate', () => {
    if (windows.size === 0) {
        createWindow();
    } else if (mainWindow && !mainWindow.isVisible()) {
        showWindow(app, mainWindow);
    }
});

app.on('before-quit', () => {
    markQuitting();
    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
    }

    // Quit can skip per-window close events, so capture geometry here too.
    const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
    if (window && !window.isDestroyed()) {
        writeWindowState(windowStatePath(), window.getNormalBounds());
    }

    cleanupDevPortsOnce();
});
