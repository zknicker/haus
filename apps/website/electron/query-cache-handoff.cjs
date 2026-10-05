'use strict';

const { appWindowOf } = require('./trusted-renderer.cjs');

// A new window boots in well under this; an unclaimed copy is dropped after it.
const handoffTtlMs = 10_000;

/**
 * A new App window starts with a copy of its opener's query cache
 * (docs/internals/app.md, "Window cache handoff"). When main opens a window
 * from another one, it asks the opener for its cache
 * (`desktop:query-cache:request` with a token), holds the offer in memory for
 * that one new window, and hands it over once when the window boots
 * (`desktop:query-cache:claim`, synchronous). Memory only: never written to
 * disk. Unclaimed copies drop after `handoffTtlMs`, when the new window goes
 * away, and on any Clerk session change (`clear`). The renderer still checks
 * the copy's user before using it.
 */
function registerQueryCacheHandoff({
    appUrl,
    BrowserWindow,
    ipcMain,
    timers = { clearTimeout, setTimeout },
}) {
    // Keyed by the new window's webContents id.
    const pending = new Map();
    let nextToken = 0;

    const drop = (contentsId) => {
        const entry = pending.get(contentsId);
        if (entry) {
            timers.clearTimeout(entry.timer);
            pending.delete(contentsId);
        }
    };
    const appContents = (event) => {
        appWindowOf(event, {
            appUrl,
            BrowserWindow,
            message: 'Only the Haus App can hand off its query cache.',
        });
        return event.sender;
    };

    ipcMain.handle('desktop:query-cache:offer', (event, token, state) => {
        const sender = appContents(event);
        for (const entry of pending.values()) {
            if (entry.token === token && entry.sourceId === sender.id && entry.state === null) {
                entry.state = state ?? null;
                return;
            }
        }
    });
    ipcMain.on('desktop:query-cache:claim', (event) => {
        let state = null;
        try {
            const contents = appContents(event);
            state = pending.get(contents.id)?.state ?? null;
            drop(contents.id);
        } catch {
            state = null;
        }
        event.returnValue = state;
    });

    return {
        /** Drops every unclaimed copy: the Clerk session changed or cleared. */
        clear: () => {
            for (const id of [...pending.keys()]) {
                drop(id);
            }
        },
        /** Asks `opener` for its cache on behalf of the just-created `window`. */
        request: (opener, window) => {
            if (opener.isDestroyed() || opener.webContents.isDestroyed()) {
                return;
            }
            const contents = window.webContents;
            const token = ++nextToken;
            const timer = timers.setTimeout(() => drop(contents.id), handoffTtlMs);
            pending.set(contents.id, {
                sourceId: opener.webContents.id,
                state: null,
                timer,
                token,
            });
            contents.once('destroyed', () => drop(contents.id));
            opener.webContents.send('desktop:query-cache:request', token);
        },
    };
}

module.exports = { handoffTtlMs, registerQueryCacheHandoff };
