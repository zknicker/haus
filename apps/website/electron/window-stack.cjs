'use strict';

/**
 * The windows' stacking order, front first, as far as Electron reports it: a
 * focused window comes to the front, a new window opens on top. Windows never
 * seen focused or created keep `getAllWindows` order behind the known ones.
 * `onClosed(window)` runs as each tracked window closes.
 */
function trackWindowStack({ app, BrowserWindow, onClosed = () => undefined }) {
    let stack = [];
    const raise = (window) => {
        stack = [window, ...stack.filter((entry) => entry !== window)];
    };
    app.on('browser-window-created', (_event, window) => {
        raise(window);
        window.once('closed', () => {
            stack = stack.filter((entry) => entry !== window);
            onClosed(window);
        });
    });
    app.on('browser-window-focus', (_event, window) => raise(window));
    return {
        /** A window brought forward without focus (`moveTop`), which Electron does not report. */
        raise,
        /** Every open window, front to back. */
        frontToBack: () => {
            const all = BrowserWindow.getAllWindows();
            const known = stack.filter((window) => all.includes(window));
            return [...known, ...all.filter((window) => !known.includes(window))];
        },
    };
}

module.exports = { trackWindowStack };
