'use strict';

/**
 * Native window events the renderer listens for: focus state (which also
 * tells message notifications whether the reader can see Haus) and macOS
 * history swipes.
 */
function forwardWindowSignals(window) {
    window.on('focus', () => {
        window.webContents.send('desktop:window:focus-state', true);
    });

    window.on('blur', () => {
        window.webContents.send('desktop:window:focus-state', false);
    });

    if (process.platform === 'darwin') {
        // "Swipe between pages" (mouse buttons 4 and 5 reach the renderer as
        // DOM mouseup events; see useDesktopHistoryNavigation). Electron
        // reports the AppKit delta convention, not the physical finger
        // direction: the back gesture arrives as 'left' (verified on device —
        // do not "fix" this to match Safari intuition).
        window.on('swipe', (_event, direction) => {
            if (direction === 'left') {
                window.webContents.send('desktop:window:history', 'back');
            } else if (direction === 'right') {
                window.webContents.send('desktop:window:history', 'forward');
            }
        });
    }
}

module.exports = { forwardWindowSignals };
