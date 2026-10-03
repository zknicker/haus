'use strict';

const pageActions = new Set(['hard-reload', 'reload', 'stop', 'zoom-in', 'zoom-out', 'zoom-reset']);
const appZoomStep = 0.5;

/**
 * Runs one shortcut or menu action for a window, whichever surface had focus.
 * Page actions (reload, stop, zoom) act on the selected browser tab's page;
 * without one, zoom falls back to the App's own zoom and reload does nothing,
 * so ⌘R never reloads the Haus renderer. Tab actions go to the renderer, which
 * owns the unified tab strip.
 */
function runBrowserWindowAction(window, workspace, action) {
    const app = window.webContents;
    if (app.isDestroyed()) {
        return;
    }
    if (pageActions.has(action)) {
        if (!workspace?.pageAction(action) && action.startsWith('zoom-')) {
            zoomApp(app, action);
        }
        return;
    }
    switch (action) {
        case 'close-tab':
            // A crashed renderer cannot answer; close the window instead.
            if (app.isCrashed()) {
                window.close();
                return;
            }
            // No app.focus() here: refocusing the App moves workspace focus off
            // the page before the renderer decides what ⌘W closes. Closing a
            // focused page hands focus back afterwards (browser-workspace close).
            app.send('desktop:window:close-request');
            return;
        case 'close-window':
            window.close();
            return;
        case 'new-tab':
            app.focus();
            app.send('desktop:window:new-tab');
            return;
        case 'settings':
            app.focus();
            app.send('desktop:settings:open');
            return;
        case 'find':
            if (!workspace?.hasActiveTab()) {
                app.send('desktop:search:open');
                return;
            }
            break;
        default:
            break;
    }
    app.focus();
    app.send('desktop:browser:shortcut', action);
}

function zoomApp(app, action) {
    const level = app.getZoomLevel();
    app.setZoomLevel(
        action === 'zoom-reset' ? 0 : level + (action === 'zoom-in' ? appZoomStep : -appZoomStep)
    );
}

module.exports = { runBrowserWindowAction };
