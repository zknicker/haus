'use strict';

const { describe, expect, test } = require('bun:test');
const { captureBrowserPage } = require('./browser-capture.cjs');

function fakeImage({ empty = false } = {}) {
    return {
        isEmpty: () => empty,
        toJPEG: (quality) => Buffer.from(`jpeg:${quality}`),
    };
}

function fakeTab({ url = 'https://example.com/', capture = async () => fakeImage() } = {}) {
    const contents = {
        url,
        destroyed: false,
        crashed: false,
        captures: 0,
        getURL: () => contents.url,
        isDestroyed: () => contents.destroyed,
        isCrashed: () => contents.crashed,
        capturePage: () => {
            contents.captures += 1;
            return capture(contents);
        },
    };
    return { view: { webContents: contents }, state: { error: null } };
}

describe('browser page capture', () => {
    test('a painted web page becomes an inline JPEG', async () => {
        const tab = fakeTab();
        const image = await captureBrowserPage(tab, () => true);
        expect(image).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg:85').toString('base64')}`);
    });

    test('pages with nothing trustworthy to show are never captured', async () => {
        const blank = fakeTab({ url: 'about:blank' });
        const crashed = fakeTab();
        crashed.view.webContents.crashed = true;
        const failed = fakeTab();
        failed.state.error = 'Offline';
        const closed = fakeTab();
        closed.view.webContents.destroyed = true;
        for (const tab of [blank, crashed, failed, closed, undefined]) {
            expect(await captureBrowserPage(tab, () => true)).toBeNull();
            expect(tab?.view.webContents.captures ?? 0).toBe(0);
        }
    });

    test('empty frames and capture failures fall back quietly', async () => {
        const empty = fakeTab({ capture: async () => fakeImage({ empty: true }) });
        const failing = fakeTab({
            capture: async () => {
                throw new Error('GPU lost');
            },
        });
        expect(await captureBrowserPage(empty, () => true)).toBeNull();
        expect(await captureBrowserPage(failing, () => true)).toBeNull();
    });

    test('a capture that finishes after the tab stops being current or navigates is discarded', async () => {
        let current = true;
        const switched = fakeTab({
            capture: async () => {
                current = false;
                return fakeImage();
            },
        });
        expect(await captureBrowserPage(switched, () => current)).toBeNull();
        const navigated = fakeTab({
            capture: async (contents) => {
                contents.url = 'https://example.com/next';
                return fakeImage();
            },
        });
        expect(await captureBrowserPage(navigated, () => true)).toBeNull();
        const closed = fakeTab({
            capture: async (contents) => {
                contents.destroyed = true;
                return fakeImage();
            },
        });
        expect(await captureBrowserPage(closed, () => true)).toBeNull();
    });
});
