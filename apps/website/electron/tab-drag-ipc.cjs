'use strict';

const { appWindowOf } = require('./trusted-renderer.cjs');
const { bandUnderCursor } = require('./tab-drag-geometry.cjs');
const {
    browserViewIds,
    isDetachRequest,
    isDragStart,
    isStripReport,
} = require('./tab-drag-reports.cjs');
const { createTabDragSession } = require('./tab-drag-session.cjs');
const { isSafeWindowRoute } = require('./window-routing.cjs');
const { trackWindowStack } = require('./window-stack.cjs');

/**
 * Tab drag between windows (ADR 0039; the session is `tab-drag-session.cjs`).
 * Renderers report their band (`desktop:tab-strip:report`), so a drag can find
 * every same-Server window's band on screen; the pressing window opens the
 * session, any window the tab rides may detach it, and only the pressing
 * window ends it. A torn-off window claims its tabs synchronously while it
 * boots (`desktop:tab-drag:claim`). The session ends without undoing
 * anything when the pressing page crashes, navigates away, or closes, or a
 * window it involves closes, so polling never outlives it.
 *
 * `openWindow({ bounds, deferShow, opener, route })` creates a hidden App window
 * that starts with a copy of `opener`'s query cache;
 * `platform` and `timers` are injectable for tests.
 */
function registerTabDrag({
    app,
    appUrl,
    BrowserWindow,
    browserWorkspaces,
    ipcMain,
    openWindow,
    platform = process.platform,
    screen,
    timers = { clearInterval, setImmediate, setInterval },
}) {
    const strips = new WeakMap();
    const handoffs = new WeakMap();
    let current = null;
    const stack = trackWindowStack({
        app,
        BrowserWindow,
        onClosed: (window) => {
            if (current?.session.involves(window)) {
                current.session.abort();
            }
        },
    });

    const appWindow = (event) => {
        return appWindowOf(event, {
            appUrl,
            BrowserWindow,
            message: 'Only the Haus App can drag tabs.',
        });
    };
    const send = (window, message) => {
        if (!(window.isDestroyed() || window.webContents.isDestroyed())) {
            window.webContents.send('desktop:tab-drag:event', message);
        }
    };
    /**
     * `activate` (a drop): front, focused, and the active app. The user's own
     * drag ended there, so on macOS it may take over from whichever app took
     * focus mid-drag; `window.focus()` alone never activates an inactive app.
     * Otherwise (a band the tab entered mid-drag, Chrome-style): ordered front
     * without focus, so the pressing window keeps the pointer.
     */
    const raise = (window, { activate }) => {
        if (window.isDestroyed()) {
            return;
        }
        if (activate) {
            window.show();
            if (platform === 'darwin' && !BrowserWindow.getFocusedWindow()) {
                app.focus({ steal: true });
            }
            window.focus();
        } else {
            window.moveTop();
        }
        stack.raise(window);
    };
    const bandAt = (point, excluded) => {
        const entries = stack.frontToBack().flatMap((window) => {
            if (window.isDestroyed() || !window.isVisible() || window.isMinimized()) {
                return [];
            }
            const strip = strips.get(window);
            return [
                {
                    content: window.getContentBounds(),
                    id: window.id,
                    serverId: strip?.serverId ?? null,
                    strip: strip?.rect ?? null,
                    window,
                    zoom: window.webContents.getZoomFactor?.() ?? 1,
                },
            ];
        });
        const id = bandUnderCursor(entries, point, {
            excludeId: excluded?.id,
            serverId: current?.serverId,
        });
        return entries.find((entry) => entry.id === id)?.window ?? null;
    };
    const start = (source, { bundle, route, serverId }) => {
        current?.session.abort();
        const safeRoute = isSafeWindowRoute(route) ? route : undefined;
        const session = createTabDragSession({
            source,
            bundle,
            deps: {
                bandAt,
                onEnd: () => {
                    if (current?.session === session) {
                        current.unwatch();
                        current = null;
                    }
                },
                openFloating: ({ bounds, bundle: claimed, onReady }) => {
                    const window = openWindow({
                        bounds,
                        deferShow: true,
                        opener: source,
                        route: safeRoute,
                    });
                    handoffs.set(window.webContents, { bundle: claimed, serverId });
                    window.once('ready-to-show', onReady);
                    return window;
                },
                raise,
                screen,
                send,
                timers,
                canTransfer: (from, to, viewIds) =>
                    browserWorkspaces.canTransfer(from, to, viewIds),
                transfer: (from, to, viewIds, shown) =>
                    browserWorkspaces.transfer(from, to, viewIds, shown),
            },
        });
        current = { serverId, session, unwatch: watchPage(source, () => session.abort()) };
        for (const window of BrowserWindow.getAllWindows()) {
            if (window !== source && strips.has(window)) {
                send(window, { kind: 'measure' });
            }
        }
    };

    ipcMain.handle('desktop:tab-strip:report', (event, value) => {
        const window = appWindow(event);
        if (value === null) {
            strips.delete(window);
            return;
        }
        if (!isStripReport(value)) {
            throw new Error('Invalid tab strip report.');
        }
        strips.set(window, { rect: value.rect, serverId: value.serverId });
    });
    ipcMain.handle('desktop:tab-drag:start', (event, value) => {
        const source = appWindow(event);
        if (!isDragStart(value)) {
            throw new Error('Invalid tab drag.');
        }
        start(source, value);
    });
    /**
     * The tab menu's Move to new window: a tear-off without the pointer. The new
     * window opens offset from the source (`openWindow`'s opener rule), claims the
     * bundle as a torn-off window does, and gets its live views before this resolves,
     * so the source releases tabs whose views are already gone. It shows focused once
     * ready. Resolves false when the views have no room there.
     */
    ipcMain.handle('desktop:tab:move-to-new-window', (event, value) => {
        const source = appWindow(event);
        if (!isDragStart(value)) {
            throw new Error('Invalid tab move.');
        }
        const window = openWindow({
            deferShow: true,
            opener: source,
            route: isSafeWindowRoute(value.route) ? value.route : undefined,
        });
        handoffs.set(window.webContents, { bundle: value.bundle, serverId: value.serverId });
        const viewIds = browserViewIds(value.bundle);
        if (!browserWorkspaces.canTransfer(source, window, viewIds)) {
            handoffs.delete(window.webContents);
            window.close();
            return false;
        }
        browserWorkspaces.transfer(source, window, viewIds);
        window.once('ready-to-show', () => raise(window, { activate: true }));
        return true;
    });
    ipcMain.handle('desktop:tab-drag:detach', (event, value) => {
        const window = appWindow(event);
        if (!(current?.session.isAttachedTo(window) && isDetachRequest(value))) {
            throw new Error('This window has no tab to detach.');
        }
        return current.session.detach(window, value);
    });
    ipcMain.handle('desktop:tab-drag:end', (event, outcome) => {
        const window = appWindow(event);
        if (current?.session.source === window && ['cancel', 'drop'].includes(outcome)) {
            current.session.end(outcome);
        }
        return null;
    });
    // Synchronous: the torn-off window's tab state initializes from it on first render.
    ipcMain.on('desktop:tab-drag:claim', (event, serverId) => {
        let handoff = null;
        try {
            appWindow(event);
            handoff = handoffs.get(event.sender) ?? null;
            handoffs.delete(event.sender);
        } catch {
            handoff = null;
        }
        event.returnValue = handoff?.serverId === serverId ? handoff.bundle : null;
    });

    return {
        /** For tests and diagnostics: the live session, if any. */
        session: () => current?.session ?? null,
    };
}

/** Calls `end` once the page is gone: crashed, navigated away, or destroyed. */
function watchPage(window, end) {
    const contents = window.webContents;
    const navigated = (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {
            end();
        }
    };
    contents.on('render-process-gone', end);
    contents.on('did-start-navigation', navigated);
    contents.on('destroyed', end);
    return () => {
        contents.removeListener('render-process-gone', end);
        contents.removeListener('did-start-navigation', navigated);
        contents.removeListener('destroyed', end);
    };
}

module.exports = { registerTabDrag };
