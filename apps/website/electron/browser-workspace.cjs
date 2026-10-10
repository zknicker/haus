'use strict';

const { captureBrowserPage } = require('./browser-capture.cjs');
const { browserUrl } = require('./browser-url.cjs');
const { findInPage, runPageAction, stopFindInPage } = require('./browser-page-actions.cjs');
const { runBrowserWindowAction } = require('./browser-window-actions.cjs');
const {
    applyBrowserPlacements,
    assertViewId,
    parseBrowserPlacements,
} = require('./browser-workspace-layout.cjs');
const { createBrowserView } = require('./browser-workspace-view.cjs');
const { waitForSkoolSession } = require('./skool-login.cjs');

const maxViews = 20;

/**
 * One window's web views (ADR 0039). The App names every view (`open` with a
 * `viewId`), places the visible ones with `setLayout`, and owns all tab
 * selection; views keep only their live pages. A page's own links and popups
 * do not open views here: they ask the App (`desktop:browser:open-request`),
 * which places the new tab and then opens its view.
 *
 * `page` carries the page-facing Electron services: `Menu` and `clipboard` for
 * the context menu, `openExternal` for mail links, and `inspect` (development
 * builds only) for Inspect Element.
 */
function createBrowserWorkspace(window, { WebContentsView, browserSession, page, skoolSession }) {
    const views = new Map();
    let placements = [];
    /**
     * Torn-off pages shown where the drag said the page sits, before this window's
     * App has booted; its first layout takes over (`adopt`).
     */
    const provisional = new Map();
    let mounted = false;
    const snapshot = () => ({
        tabs: [...views].map(([id, entry]) => ({ id, ...entry.state })),
    });
    const send = (channel, value) => {
        if (!window.webContents.isDestroyed()) {
            window.webContents.send(channel, value);
        }
    };
    const publish = () => send('desktop:browser:state', snapshot());
    const layout = () =>
        applyBrowserPlacements(window, views, [
            ...placements,
            ...[...provisional].map(([viewId, bounds]) => ({ bounds, focused: false, viewId })),
        ]);
    const isPlaced = (id) => placements.some((placement) => placement.viewId === id);
    const focusedId = () => placements.find((placement) => placement.focused)?.viewId ?? null;
    /** Asks the App to open `url` in a new tab beside `openerId` (null: the App window itself). */
    const requestOpen = (url, openerId, { background = false } = {}) =>
        send('desktop:browser:open-request', { url: browserUrl(url), openerId, background });
    /** The window-facing side of one view: everything its page listeners reach (`createBrowserView`). */
    const hostFor = (viewId) => ({
        window,
        isLive: (entry) => views.get(viewId) === entry,
        publish,
        requestOpen: (target, options) => requestOpen(target, viewId, options),
        // Keys pressed inside a page act on that page, whichever pane the App has focused.
        runShortcut: (action) => runBrowserWindowAction(window, scopedTo(viewId), action),
        onFocus: () => send('desktop:browser:focus', viewId),
    });
    const open = (url, viewId, selectedSession = browserSession) => {
        if (views.has(viewId)) {
            return;
        }
        if (views.size >= maxViews) {
            throw new Error('Close a browser tab before opening another.');
        }
        const entry = createBrowserView(hostFor(viewId), url, {
            WebContentsView,
            browserSession: selectedSession,
            page,
        });
        views.set(viewId, entry);
        window.contentView.addChildView(entry.view);
        layout();
        publish();
        void entry.load();
    };
    /** Takes a view out of this window, page alive; null when it is not here. */
    const detach = (id) => {
        const entry = views.get(id);
        if (!entry) {
            return null;
        }
        // Losing the focused page would leave App shortcuts dead until a click.
        const hadFocus = entry.view.webContents.isFocused();
        window.contentView.removeChildView(entry.view);
        views.delete(id);
        if (hadFocus && !window.webContents.isDestroyed()) {
            window.webContents.focus();
        }
        placements = placements.filter((placement) => placement.viewId !== id);
        provisional.delete(id);
        publish();
        return entry;
    };
    const close = (id) => {
        detach(id)?.view.webContents.close();
    };
    const reset = () => {
        mounted = false;
        for (const id of [...views.keys()]) {
            close(id);
        }
        placements = [];
    };
    const viewEntry = (id) => {
        const entry = views.get(id);
        if (!entry) {
            throw new Error('Browser tab no longer exists.');
        }
        return entry;
    };
    const pageAction = (action, id = focusedId()) => {
        const entry = id !== null && isPlaced(id) ? views.get(id) : undefined;
        if (!entry) {
            return false;
        }
        runPageAction(entry.view.webContents, entry.state, { action }, publish);
        return true;
    };
    const scopedTo = (id) => ({
        hasActiveTab: () => isPlaced(id),
        pageAction: (action) => pageAction(action, id),
    });
    const command = (input) => {
        if (!mounted && input?.kind === 'open') {
            throw new Error('Open a Server before opening browser tabs.');
        }
        switch (input?.kind) {
            case 'mount':
                mounted = true;
                break;
            case 'open':
                // Without a view name the App asks for a tab first (older callers, plain links).
                if (input.viewId === undefined) {
                    requestOpen(input.url, null);
                } else {
                    open(browserUrl(input.url), assertViewId(input.viewId));
                }
                break;
            case 'find': {
                const entry = viewEntry(input.id);
                findInPage(entry.view.webContents, entry.state, input);
                break;
            }
            case 'stop-find': {
                const entry = views.get(input.id);
                if (entry && !entry.view.webContents.isDestroyed()) {
                    stopFindInPage(entry.view.webContents, entry.state, publish);
                }
                break;
            }
            case 'close':
                close(input.id);
                break;
            case 'reset':
                reset();
                break;
            case 'navigate': {
                const id = input.id ?? focusedId();
                if (id === null) {
                    throw new Error('Select a browser tab first.');
                }
                const entry = viewEntry(id);
                runPageAction(entry.view.webContents, entry.state, input, publish);
                break;
            }
            default:
                throw new Error('Unknown browser command.');
        }
        return snapshot();
    };
    const setLayout = (value) => {
        placements = parseBrowserPlacements(value);
        // The App places every view it shows, so its first layout supersedes any handoff.
        provisional.clear();
        layout();
    };
    window.on('resize', layout);
    window.on('closed', () => {
        for (const entry of views.values()) {
            if (!entry.view.webContents.isDestroyed()) {
                entry.view.webContents.close();
            }
        }
        views.clear();
    });
    window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {
            mounted = false;
            placements = [];
            layout();
        }
    });
    return {
        skoolLogin: (id) => {
            assertViewId(id);
            if (!mounted || views.has(id)) {
                throw new Error('Open a new Skool sign-in tab.');
            }
            open('https://www.skool.com/login', id, skoolSession(id));
            return waitForSkoolSession(viewEntry(id).view.webContents);
        },
        /** Only a placed page is captured: a hidden one may show stale or no pixels. */
        capture: (id) => captureBrowserPage(views.get(id), () => isPlaced(id)),
        command,
        /** A web link from the App window itself: the App opens it as a tab. */
        open: (value) => {
            if (!mounted) {
                throw new Error('Browser workspace is not mounted.');
            }
            requestOpen(value, null);
        },
        /** True while the App's focused web page is on screen; page shortcuts need one. */
        hasActiveTab: () => focusedId() !== null,
        /** Runs a page action on the focused placed page; false when none. */
        pageAction: (action) => pageAction(action),
        setLayout,
        snapshot,
        /** Tab drag: hands a live view to another window's workspace (`adopt`). */
        release: detach,
        has: (id) => views.has(id),
        /** Tab drag: whether `ids` fit under the view limit here (views already here count once). */
        hasRoomFor: (ids) => views.size + ids.filter((id) => !views.has(id)).length <= maxViews,
        /**
         * Tab drag: takes in a live view from another window. Its page now
         * answers to this window. It stays hidden until the App here places it,
         * unless `bounds` (CSS px, validated by the caller) shows it at once: a
         * torn-off window's page appears before its App boots, and the App's
         * first layout takes over from the same spot.
         */
        adopt: (id, entry, bounds) => {
            if (views.has(id)) {
                entry.view.webContents.close();
                return;
            }
            if (views.size >= maxViews) {
                throw new Error('This window has no room for another browser tab.');
            }
            entry.host = hostFor(id);
            entry.view.setVisible(false);
            if (bounds) {
                provisional.set(id, bounds);
            }
            views.set(id, entry);
            window.contentView.addChildView(entry.view);
            layout();
            publish();
        },
    };
}

module.exports = { createBrowserWorkspace };
