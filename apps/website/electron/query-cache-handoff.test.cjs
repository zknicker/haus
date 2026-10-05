'use strict';

const { EventEmitter } = require('node:events');
const { expect, test } = require('bun:test');
const { handoffTtlMs, registerQueryCacheHandoff } = require('./query-cache-handoff.cjs');

const appUrl = 'https://haus.chat';

function harness() {
    const handlers = new Map();
    const listeners = new Map();
    const timers = new Map();
    let nextTimer = 0;
    const windows = new Map();
    const appWindow = (id) => {
        const contents = Object.assign(new EventEmitter(), {
            id,
            isDestroyed: () => false,
            mainFrame: { frameTreeNodeId: id, url: `${appUrl}/` },
            sent: [],
            send: (channel, ...args) => contents.sent.push([channel, ...args]),
        });
        const window = { isDestroyed: () => false, webContents: contents };
        windows.set(contents, window);
        return window;
    };
    const handoff = registerQueryCacheHandoff({
        appUrl,
        BrowserWindow: { fromWebContents: (contents) => windows.get(contents) ?? null },
        ipcMain: {
            handle: (name, handler) => handlers.set(name, handler),
            on: (name, handler) => listeners.set(name, handler),
        },
        timers: {
            clearTimeout: (id) => timers.delete(id),
            setTimeout: (run, ms) => {
                timers.set(++nextTimer, { ms, run });
                return nextTimer;
            },
        },
    });
    const event = (window) => ({
        sender: window.webContents,
        senderFrame: { ...window.webContents.mainFrame },
    });
    return {
        appWindow,
        claim: (window) => {
            const claimEvent = event(window);
            listeners.get('desktop:query-cache:claim')(claimEvent);
            return claimEvent.returnValue;
        },
        expire: () => {
            for (const [id, timer] of timers) {
                timers.delete(id);
                timer.run();
            }
        },
        handoff,
        offer: (window, token, state) =>
            handlers.get('desktop:query-cache:offer')(event(window), token, state),
        timers,
    };
}

function opened(h) {
    const opener = h.appWindow(1);
    const created = h.appWindow(2);
    h.handoff.request(opener, created);
    const [[channel, token]] = opener.webContents.sent;
    expect(channel).toBe('desktop:query-cache:request');
    return { created, opener, token };
}

const state = { state: { mutations: [], queries: [] }, userId: 'user_1' };

test('a new window claims its opener cache exactly once', () => {
    const h = harness();
    const { created, opener, token } = opened(h);
    h.offer(opener, token, state);
    expect(h.claim(created)).toEqual(state);
    expect(h.claim(created)).toBeNull();
    expect(h.timers.size).toBe(0);
});

test('only the asked opener can fill the copy', () => {
    const h = harness();
    const { created, token } = opened(h);
    h.offer(h.appWindow(3), token, state);
    expect(h.claim(created)).toBeNull();
});

test('an unclaimed copy expires', () => {
    const h = harness();
    const { created, opener, token } = opened(h);
    h.offer(opener, token, state);
    expect([...h.timers.values()].map((timer) => timer.ms)).toEqual([handoffTtlMs]);
    h.expire();
    expect(h.claim(created)).toBeNull();
});

test('closing the new window or a session change drops the copy', () => {
    const h = harness();
    const first = opened(h);
    h.offer(first.opener, first.token, state);
    first.created.webContents.emit('destroyed');
    expect(h.claim(first.created)).toBeNull();

    const h2 = harness();
    const second = opened(h2);
    h2.offer(second.opener, second.token, state);
    h2.handoff.clear();
    expect(h2.claim(second.created)).toBeNull();
});

test('a window nobody opened claims nothing', () => {
    const h = harness();
    expect(h.claim(h.appWindow(9))).toBeNull();
});
