'use strict';

// Window lifecycle rules for the macOS "closing the last window hides it"
// behavior. The decision is pure so it unit-tests without launching the app.

// Set once a real quit starts (Cmd+Q, menu Quit, update restart).
let quitting = false;

/** Call before any real quit; `autoUpdater.quitAndInstall` closes windows before `before-quit`. */
function markQuitting() {
    quitting = true;
}

/**
 * macOS keeps Haus running when its last window closes: that window hides
 * instead, so its renderer stays connected and keeps raising message
 * notifications. A real quit closes normally; other windows and other
 * platforms always close.
 */
function shouldHideInsteadOfClose({ isQuitting, platform, windowCount }) {
    return platform === 'darwin' && !isQuitting && windowCount <= 1;
}

/** Hides `window` instead of closing it whenever `shouldHideInsteadOfClose` says so. */
function hideLastWindowOnClose(window, windowCount) {
    window.on('close', (event) => {
        const hide = shouldHideInsteadOfClose({
            isQuitting: quitting,
            platform: process.platform,
            windowCount: windowCount(),
        });
        if (hide) {
            event.preventDefault();
            window.hide();
        }
    });
}

/** Brings a window forward, including one hidden by closing it or minimized. */
function showWindow(app, window) {
    if (!window || window.isDestroyed()) {
        return;
    }
    if (window.isMinimized()) {
        window.restore();
    }
    window.show();
    window.focus();
    app.focus({ steal: true });
}

module.exports = { hideLastWindowOnClose, markQuitting, shouldHideInsteadOfClose, showWindow };
