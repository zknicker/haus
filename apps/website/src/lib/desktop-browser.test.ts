import { expect, test } from 'bun:test';
import { parseBrowserCapture, parseBrowserWorkspace } from './desktop-browser.ts';

const tab = {
    id: 'page',
    title: 'Amazon',
    url: 'https://amazon.com',
    error: null,
    faviconUrl: 'https://amazon.com/favicon.ico',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    zoomFactor: 1,
    find: { activeMatch: 1, matches: 3 },
};

test('browser snapshots validate the entire tab and active identity', () => {
    expect(parseBrowserWorkspace({ activeId: 'page', tabs: [tab] })).toEqual({
        activeId: 'page',
        tabs: [tab],
    });
    for (const value of [
        null,
        {},
        { activeId: 'missing', tabs: [tab] },
        { activeId: null, tabs: [{ ...tab, loading: 'true' }] },
        { activeId: null, tabs: [{}] },
        { activeId: null, tabs: [{ ...tab, faviconUrl: undefined }] },
        { activeId: null, tabs: [{ ...tab, faviconUrl: 'javascript:alert(1)' }] },
        { activeId: null, tabs: [{ ...tab, faviconUrl: 'file:///icon.png' }] },
        { activeId: null, tabs: [{ ...tab, zoomFactor: 0 }] },
        { activeId: null, tabs: [{ ...tab, find: { activeMatch: '1', matches: 3 } }] },
        { activeId: null, tabs: [{ ...tab, find: undefined }] },
    ]) {
        expect(parseBrowserWorkspace(value)).toBeNull();
    }
});

test('page captures render only as inline PNG or JPEG images', () => {
    for (const value of [
        'data:image/jpeg;base64,/9j/4AAQ',
        'data:image/png;base64,iVBORw0K==',
    ] as const) {
        expect(parseBrowserCapture(value)).toBe(value);
    }
    for (const value of [
        null,
        42,
        '',
        'https://example.com/page.jpg',
        'data:image/svg+xml;base64,PHN2Zz4=',
        'data:image/jpeg,raw',
        'data:image/jpeg;base64,abc"onerror="x',
        'data:text/html;base64,PGgxPg==',
    ]) {
        expect(parseBrowserCapture(value)).toBeNull();
    }
});
