'use strict';

const { describe, expect, test } = require('bun:test');
const {
    isAppNavigationUrl,
    isExternalBrowserUrl,
    registerExternalLinkHandlers,
} = require('./external-link-handlers.cjs');

describe('external browser URLs', () => {
    test('allows browser-safe protocols', () => {
        expect(isExternalBrowserUrl('https://console.cloud.google.com/apis')).toBe(true);
        expect(isExternalBrowserUrl('http://localhost:3000')).toBe(true);
        expect(isExternalBrowserUrl('mailto:hello@example.com')).toBe(true);
    });

    test('rejects unsafe or app-local protocols', () => {
        expect(isExternalBrowserUrl('javascript:alert(1)')).toBe(false);
        expect(isExternalBrowserUrl('file:///tmp/haus.html')).toBe(false);
        expect(isExternalBrowserUrl('/settings')).toBe(false);
    });
});

describe('app navigation URLs', () => {
    test('allows the desktop app origin', () => {
        expect(
            isAppNavigationUrl('http://127.0.0.1:5173/settings', 'http://127.0.0.1:5173/dashboard')
        ).toBe(true);
    });

    test('rejects external web origins', () => {
        expect(
            isAppNavigationUrl(
                'https://console.cloud.google.com/apis',
                'http://127.0.0.1:5173/dashboard'
            )
        ).toBe(false);
    });
});

describe('external link handlers', () => {
    test('web links use workspace tabs while mail links keep their system handler', () => {
        const browser = [];
        const external = [];
        const webContents = createWebContents();
        registerExternalLinkHandlers(
            { webContents },
            {
                appUrl: 'https://haus.chat',
                openBrowser: (url) => browser.push(url),
                openExternal: (url) => external.push(url),
            }
        );
        webContents.openHandler({ url: 'https://amazon.com' });
        webContents.openHandler({ url: 'mailto:hello@example.com' });
        expect(browser).toEqual(['https://amazon.com']);
        expect(external).toEqual(['mailto:hello@example.com']);
    });
    test('opens new-window links in the desktop browser and denies Haus windows', () => {
        const opened = [];
        const webContents = createWebContents();

        registerExternalLinkHandlers(
            { webContents },
            {
                appUrl: 'http://127.0.0.1:5173',
                openExternal: (url) => {
                    opened.push(url);
                    return Promise.resolve();
                },
            }
        );

        expect(webContents.openHandler({ url: 'https://console.cloud.google.com/apis' })).toEqual({
            action: 'deny',
        });
        expect(opened).toEqual(['https://console.cloud.google.com/apis']);

        expect(webContents.openHandler({ url: 'javascript:alert(1)' })).toEqual({
            action: 'deny',
        });
        expect(opened).toEqual(['https://console.cloud.google.com/apis']);
    });

    test('keeps app navigation in Haus', () => {
        const opened = [];
        const webContents = createWebContents();
        const event = createNavigationEvent();

        registerExternalLinkHandlers(
            { webContents },
            {
                appUrl: 'http://127.0.0.1:5173/dashboard',
                openExternal: (url) => {
                    opened.push(url);
                    return Promise.resolve();
                },
            }
        );

        webContents.navigate(event, 'http://127.0.0.1:5173/settings');

        expect(event.prevented).toBe(false);
        expect(opened).toEqual([]);
    });

    test('opens external navigation in the desktop browser', () => {
        const opened = [];
        const webContents = createWebContents();
        const event = createNavigationEvent();

        registerExternalLinkHandlers(
            { webContents },
            {
                appUrl: 'http://127.0.0.1:5173/dashboard',
                openExternal: (url) => {
                    opened.push(url);
                    return Promise.resolve();
                },
            }
        );

        webContents.navigate(event, 'https://console.cloud.google.com/apis');

        expect(event.prevented).toBe(true);
        expect(opened).toEqual(['https://console.cloud.google.com/apis']);
    });
});

function createWebContents() {
    return {
        navigate: null,
        openHandler: null,
        on(eventName, listener) {
            if (eventName === 'will-navigate') {
                this.navigate = listener;
            }
        },
        setWindowOpenHandler(handler) {
            this.openHandler = handler;
        },
    };
}

function createNavigationEvent() {
    return {
        prevented: false,
        preventDefault() {
            this.prevented = true;
        },
    };
}
