import { expect, test } from 'bun:test';
import {
    mergeBrowserHistory,
    parseBrowserHistory,
    removeBrowserHistoryEntry,
    removeFromBrowserHistory,
} from './use-browser-history.ts';

test('local browser history deduplicates visited addresses, updates titles, and caps retention', () => {
    const previous = Array.from({ length: 50 }, (_, index) => ({
        faviconUrl: null,
        title: `Page ${index}`,
        url: `https://example.com/${index}`,
    }));
    const result = mergeBrowserHistory(previous, [
        { faviconUrl: null, title: 'Updated page', url: 'https://example.com/5' },
        { faviconUrl: null, title: 'New page', url: 'https://example.com/new' },
    ]);
    expect(result).toHaveLength(50);
    expect(result.slice(0, 2)).toEqual([
        { faviconUrl: null, title: 'New page', url: 'https://example.com/new' },
        { faviconUrl: null, title: 'Updated page', url: 'https://example.com/5' },
    ]);
    expect(result.filter((entry) => entry.url === 'https://example.com/5')).toHaveLength(1);
});

test('a revisit seen before its favicon arrives keeps the stored favicon', () => {
    const icon = 'https://example.com/favicon.ico';
    const previous = [{ faviconUrl: icon, title: 'Example', url: 'https://example.com/' }];
    expect(
        mergeBrowserHistory(previous, [
            { faviconUrl: null, title: 'Example', url: 'https://example.com/' },
        ])[0]?.faviconUrl
    ).toBe(icon);
    expect(
        mergeBrowserHistory(previous, [
            {
                faviconUrl: 'data:image/png;base64,AA==',
                title: 'Example',
                url: 'https://example.com/',
            },
        ])[0]?.faviconUrl
    ).toBe('data:image/png;base64,AA==');
});

test('stored history tolerates entries saved before favicons and drops unsafe ones', () => {
    expect(
        parseBrowserHistory([
            { title: 'Old', url: 'https://old.test/' },
            { faviconUrl: 'javascript:alert(1)', title: 'Bad icon', url: 'https://icon.test/' },
            { faviconUrl: 'https://a.test/i.png', title: 'Good', url: 'https://a.test/' },
            { title: 'Creds', url: 'https://user:pw@a.test/' },
            { title: 'Blank', url: 'about:blank' },
            { url: 'https://untitled.test/' },
        ])
    ).toEqual([
        { faviconUrl: null, title: 'Old', url: 'https://old.test/' },
        { faviconUrl: null, title: 'Bad icon', url: 'https://icon.test/' },
        { faviconUrl: 'https://a.test/i.png', title: 'Good', url: 'https://a.test/' },
    ]);
    expect(parseBrowserHistory({})).toEqual([]);
});

test('removing an address forgets only that entry and persists the rest', () => {
    const a = { faviconUrl: null, title: 'A', url: 'https://a.test/' };
    const b = { faviconUrl: null, title: 'B', url: 'https://b.test/' };
    expect(removeFromBrowserHistory([a, b], a.url)).toEqual([b]);
    expect(removeFromBrowserHistory([a, b], 'https://missing.test/')).toEqual([a, b]);

    const stored = new Map([['haus.browser.history', JSON.stringify([a, b])]]);
    const original = globalThis.localStorage;
    globalThis.localStorage = {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => {
            stored.set(key, value);
        },
    } as unknown as Storage;
    try {
        removeBrowserHistoryEntry(b.url);
        expect(JSON.parse(stored.get('haus.browser.history') ?? '')).toEqual([a]);
    } finally {
        globalThis.localStorage = original;
    }
});
