'use strict';

const { expect, test } = require('bun:test');
const { registerClerkSessionHandoff, sessionTokenClaims } = require('./clerk-session-handoff.cjs');

const appUrl = 'https://haus.chat';

function jwt(claims) {
    const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

function harness() {
    const handlers = new Map();
    const listeners = new Map();
    const clock = { now: 1_000_000 };
    const sessionChanges = { count: 0 };
    const appContents = {
        mainFrame: { frameTreeNodeId: 1, url: `${appUrl}/` },
        getURL: () => `${appUrl}/`,
    };
    const appWindow = { webContents: appContents };
    const pageContents = {
        mainFrame: { frameTreeNodeId: 2, url: `${appUrl}/` },
        getURL: () => `${appUrl}/`,
    };
    registerClerkSessionHandoff({
        appUrl,
        BrowserWindow: {
            fromWebContents: (contents) => (contents === appContents ? appWindow : null),
        },
        ipcMain: {
            handle: (name, handler) => handlers.set(name, handler),
            on: (name, handler) => listeners.set(name, handler),
        },
        now: () => clock.now,
        onSessionChange: () => {
            sessionChanges.count += 1;
        },
    });
    // A fresh WebFrameMain-like object per event: identity must not matter.
    const event = (contents, frame = { ...contents.mainFrame }) => ({
        sender: contents,
        senderFrame: frame,
    });
    return {
        clock,
        peek: (contents = appContents) => {
            // Electron's IpcMainEvent.returnValue is write-only: setting it sends
            // the reply and reading it back yields undefined.
            const reply = { value: undefined };
            const peekEvent = event(contents);
            Object.defineProperty(peekEvent, 'returnValue', {
                get: () => undefined,
                set: (value) => {
                    reply.value = value;
                },
            });
            listeners.get('desktop:auth:session-peek')(peekEvent);
            return reply.value;
        },
        share: (token, contents = appContents) =>
            handlers.get('desktop:auth:session-share')(event(contents), token),
        shareFromFrame: (frame, token) =>
            handlers.get('desktop:auth:session-share')(event(appContents, frame), token),
        pageContents,
        sessionChanges,
    };
}

const token = jwt({ exp: 1060, iat: 1000, sid: 'sess_1', sub: 'user_1' });

test('a booting window peeks the session token another window shared', () => {
    const h = harness();
    expect(h.peek()).toBeNull();
    h.share(token);
    expect(h.peek()).toBe(token);
});

test('a token close to expiry or cleared on sign-out is not handed out', () => {
    const h = harness();
    h.share(token);
    h.clock.now = 1_046_000;
    expect(h.peek()).toBeNull();
    h.clock.now = 1_000_000;
    h.share(null);
    expect(h.peek()).toBeNull();
});

test('only the App window itself can share or peek, and only session tokens', () => {
    const h = harness();
    expect(() => h.share(token, h.pageContents)).toThrow();
    expect(() => h.share('not-a-jwt')).toThrow();
    expect(() => h.share(jwt({ exp: 1060, iat: 1000, sub: 'user_1' }))).toThrow();
    expect(() => h.share(jwt({ exp: 1060, sid: 'sess_1', sub: 'user_1' }))).toThrow();
    const subframe = { frameTreeNodeId: 7, url: `${appUrl}/` };
    expect(() => h.shareFromFrame(subframe, token)).toThrow();
    expect(() => h.shareFromFrame(null, token)).toThrow();
    expect(() => h.shareFromFrame({ url: `${appUrl}/` }, token)).toThrow();
    h.share(token);
    expect(h.peek(h.pageContents)).toBeNull();
});

test('a stale share from another window cannot replace a newer token', () => {
    const h = harness();
    const refreshed = jwt({ exp: 1100, iat: 1040, sid: 'sess_1', sub: 'user_1' });
    h.share(refreshed);
    h.share(token);
    expect(h.peek()).toBe(refreshed);
});

test('a different session replaces the token only when strictly newer', () => {
    const h = harness();
    const userTwo = jwt({ exp: 1060, iat: 1000, sid: 'sess_2', sub: 'user_2' });
    h.share(token);
    h.share(userTwo);
    expect(h.peek()).toBe(token);
    const userTwoLater = jwt({ exp: 1061, iat: 1001, sid: 'sess_2', sub: 'user_2' });
    h.share(userTwoLater);
    expect(h.peek()).toBe(userTwoLater);
    h.share(token);
    expect(h.peek()).toBe(userTwoLater);
});

test('sign-out clears the token and a stale share cannot restore it', () => {
    const h = harness();
    const later = jwt({ exp: 1061, iat: 1001, sid: 'sess_1', sub: 'user_1' });
    h.share(later);
    h.share(null);
    h.share(token);
    expect(h.peek()).toBeNull();
    const signedIn = jwt({ exp: 1070, iat: 1010, sid: 'sess_2', sub: 'user_2' });
    h.share(signedIn);
    expect(h.peek()).toBe(signedIn);
});

test('a new session or a sign-out reports a session change; a refresh does not', () => {
    const h = harness();
    h.share(token);
    h.share(jwt({ exp: 1120, iat: 1060, sid: 'sess_1', sub: 'user_1' }));
    expect(h.sessionChanges.count).toBe(1);
    h.share(jwt({ exp: 1180, iat: 1120, sid: 'sess_2', sub: 'user_2' }));
    h.share(null);
    expect(h.sessionChanges.count).toBe(3);
});

test('sessionTokenClaims reads the claims of a session JWT', () => {
    expect(sessionTokenClaims(token)).toMatchObject({ exp: 1060, iat: 1000, sid: 'sess_1' });
    expect(sessionTokenClaims(42)).toBeNull();
    expect(sessionTokenClaims('a.!!!.c')).toBeNull();
});
