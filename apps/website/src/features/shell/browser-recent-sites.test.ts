import { expect, test } from 'bun:test';
import type { BrowserHistoryEntry } from '../../hooks/browser/use-browser-history.ts';
import { selectRecentSites } from './browser-recent-sites.ts';

const entry = (url: string, title = '', faviconUrl: string | null = null): BrowserHistoryEntry => ({
    faviconUrl,
    title,
    url,
});

test('recent sites keep one tile per origin, reopening its most recent page', () => {
    const sites = selectRecentSites([
        entry('https://github.com/haus/pulls', 'Pulls'),
        entry('https://example.com/', 'Example Domain'),
        entry('https://github.com/', 'GitHub'),
    ]);
    expect(sites.map((site) => [site.origin, site.url, site.label])).toEqual([
        ['https://github.com', 'https://github.com/haus/pulls', 'Pulls'],
        ['https://example.com', 'https://example.com/', 'Example Domain'],
    ]);
});

test('recent sites skip non-web addresses and cap at eight', () => {
    const history = [
        entry('about:blank', 'Blank'),
        entry('file:///etc/hosts', 'Hosts'),
        entry('not a url', 'Broken'),
        ...Array.from({ length: 12 }, (_, index) =>
            entry(`https://site${index}.test/`, `Site ${index}`)
        ),
    ];
    const sites = selectRecentSites(history);
    expect(sites).toHaveLength(8);
    expect(sites[0]?.origin).toBe('https://site0.test');
    expect(sites.at(-1)?.origin).toBe('https://site7.test');
});

test('recent sites fall back to the host for untitled pages', () => {
    expect(selectRecentSites([entry('https://www.wikipedia.org/wiki/x', '  ')])[0]?.label).toBe(
        'wikipedia.org'
    );
});

test('a recent site without a favicon borrows one from an older visit to the same origin', () => {
    const [site] = selectRecentSites([
        entry('https://example.com/new', 'New'),
        entry('https://example.com/old', 'Old', 'https://example.com/favicon.ico'),
    ]);
    expect(site?.faviconUrl).toBe('https://example.com/favicon.ico');
});
