import { expect, test } from 'bun:test';
import {
    browserViewsCovered,
    coverBrowserViews,
    parseBrowserCapture,
    parseBrowserOpenRequest,
    parseBrowserWorkspace,
    subscribeBrowserViewCovers,
} from './desktop-browser.ts';

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

test('browser snapshots validate every view and carry no selection', () => {
    expect(parseBrowserWorkspace({ tabs: [tab] })).toEqual({ tabs: [tab] });
    for (const value of [
        null,
        {},
        { tabs: 'page' },
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

test('open requests carry a web URL, the opener view, and the background flag', () => {
    const request = { url: 'https://example.com/', openerId: 'view-1', background: true };
    expect(parseBrowserOpenRequest(request)).toEqual(request);
    expect(parseBrowserOpenRequest({ ...request, openerId: null })).toEqual({
        ...request,
        openerId: null,
    });
    for (const value of [
        null,
        { ...request, url: 'file:///etc/passwd' },
        { ...request, openerId: 4 },
        { ...request, background: 'yes' },
        { url: request.url },
    ]) {
        expect(parseBrowserOpenRequest(value)).toBeNull();
    }
});

test('web view covers nest and each release counts once', () => {
    let changes = 0;
    const unsubscribe = subscribeBrowserViewCovers(() => {
        changes += 1;
    });
    const drag = coverBrowserViews();
    const other = coverBrowserViews();
    expect(browserViewsCovered()).toBe(true);
    drag();
    drag();
    expect(browserViewsCovered()).toBe(true);
    other();
    expect(browserViewsCovered()).toBe(false);
    expect(changes).toBe(4);
    unsubscribe();
});
