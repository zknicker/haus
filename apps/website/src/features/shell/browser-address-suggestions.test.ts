import { expect, test } from 'bun:test';
import type { BrowserHistoryEntry } from '../../hooks/browser/use-browser-history.ts';
import {
    findBrowserMatch,
    matchTier,
    selectBrowserAddressSuggestions,
} from './browser-address-suggestions.ts';

const entry = (url: string, title = ''): BrowserHistoryEntry => ({ faviconUrl: null, title, url });
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

test('untouched, the list is recent history, deduplicated, without the open page, capped at 8', () => {
    const history = [
        entry('https://open.test/', 'Open'),
        entry('https://a.test/', 'A'),
        entry('https://a.test/', 'A again'),
        ...Array.from({ length: 10 }, (_, index) => entry(`https://n${index}.test/`)),
    ];
    const rows = selectBrowserAddressSuggestions({
        history,
        pageUrl: 'https://open.test/',
        query: null,
    });
    expect(rows).toHaveLength(8);
    expect(ids(rows).slice(0, 2)).toEqual(['history:https://a.test/', 'history:https://n0.test/']);
    expect(rows.every((row) => row.kind === 'history')).toBe(true);
    expect(selectBrowserAddressSuggestions({ history: [], pageUrl: '', query: null })).toEqual([]);
});

test('typed text leads with Go to for addresses and Search for anything else', () => {
    const go = selectBrowserAddressSuggestions({ history: [], pageUrl: '', query: ' github.com ' });
    expect(go).toEqual([
        { kind: 'go', id: 'input', label: 'Go to github.com', value: 'github.com' },
    ]);
    const [search] = selectBrowserAddressSuggestions({
        history: [],
        pageUrl: '',
        query: 'haus tabs',
    });
    expect(search).toMatchObject({ kind: 'search', label: 'Search Google for “haus tabs”' });
    expect(selectBrowserAddressSuggestions({ history: [], pageUrl: '', query: '  ' })).toEqual([]);
});

test('history matches rank host prefix, then word prefix, then substring, then recency', () => {
    const history = [
        entry('https://news.test/story', 'A story about git'), // word prefix in title, newest
        entry('https://blog.test/legit', 'Legit tips'), // substring only
        entry('https://www.github.com/zk', 'Zach'), // host prefix, www ignored
        entry('https://docs.test/', 'Git handbook'), // word prefix in title, older
        entry('https://gitlab.com/', 'GitLab'), // host prefix, older
        entry('https://other.test/', 'Unrelated'),
    ];
    const rows = selectBrowserAddressSuggestions({ history, pageUrl: '', query: 'git' });
    expect(ids(rows)).toEqual([
        'input',
        'history:https://www.github.com/zk',
        'history:https://gitlab.com/',
        'history:https://news.test/story',
        'history:https://docs.test/',
        'history:https://blog.test/legit',
    ]);
});

test('tied rows keep recency order from keystroke to keystroke', () => {
    const history = [
        entry('https://gitea.io/', 'Gitea'),
        entry('https://github.com/', 'GitHub'),
        entry('https://gitlab.com/', 'GitLab'),
        entry('https://go.dev/', 'Go'),
    ];
    const typed = (query: string) =>
        ids(selectBrowserAddressSuggestions({ history, pageUrl: '', query })).slice(1);
    const hosts = ['https://gitea.io/', 'https://github.com/', 'https://gitlab.com/'];
    expect(typed('g')).toEqual([...hosts, 'https://go.dev/'].map((url) => `history:${url}`));
    for (const query of ['gi', 'git', 'GIT']) {
        expect(typed(query)).toEqual(hosts.map((url) => `history:${url}`));
    }
    // The same input always yields the same rows.
    expect(typed('git')).toEqual(typed('git'));
});

test('typed rows cap at 8 and leave out the page the Go row already opens', () => {
    const history = [
        entry('https://example.com/', 'Example'),
        ...Array.from({ length: 12 }, (_, index) => entry(`https://example.com/${index}`)),
    ];
    const rows = selectBrowserAddressSuggestions({
        history,
        pageUrl: '',
        query: 'https://example.com/',
    });
    expect(rows).toHaveLength(8);
    expect(ids(rows)).not.toContain('history:https://example.com/');
});

test('match tiers and highlighted spans', () => {
    expect(matchTier(entry('https://github.com/'), 'git')).toBe(0);
    expect(matchTier(entry('https://a.test/', 'The Git book'), 'git')).toBe(1);
    expect(matchTier(entry('https://a.test/docs/git-guide'), 'git')).toBe(1);
    expect(matchTier(entry('https://a.test/', 'Legit'), 'git')).toBe(2);
    expect(matchTier(entry('https://a.test/?q=git'), 'git')).toBe(2);
    expect(matchTier(entry('https://a.test/', 'Nothing'), 'git')).toBeNull();

    expect(findBrowserMatch('Legit Git', 'git')).toEqual([6, 9]);
    expect(findBrowserMatch('Legit', 'git')).toEqual([2, 5]);
    expect(findBrowserMatch('Legit', 'xyz')).toBeNull();
    expect(findBrowserMatch('Legit', '')).toBeNull();
});

test('history rows fall back to the address when untitled and bold the typed text', () => {
    const [, row] = selectBrowserAddressSuggestions({
        history: [entry('https://www.github.com/zk'), entry('https://a.test/', 'GitHub home')],
        pageUrl: '',
        query: 'git',
    });
    expect(row).toMatchObject({
        title: 'github.com/zk',
        displayUrl: 'github.com/zk',
        titleMatch: [0, 3],
        displayUrlMatch: null,
        value: 'https://www.github.com/zk',
    });
});
