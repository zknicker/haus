import { toast } from '@heroui/react';
import * as React from 'react';
import { type BrowserTab, isFaviconUrl } from '../../lib/desktop-browser.ts';

export interface BrowserHistoryEntry {
    /** The page's favicon when last seen; entries saved before favicons were kept read as null. */
    faviconUrl: string | null;
    title: string;
    url: string;
}
const historyKey = 'haus.browser.history';

/**
 * App-local browser history, most recent first. Visits in `tabs` are recorded as their titles and
 * favicons settle; the address field can also remove an entry, so history is one module store
 * that every reader shares.
 */
export function useBrowserHistory(tabs: BrowserTab[]) {
    const history = React.useSyncExternalStore(subscribe, getHistory);
    // Per tab, the last recorded url + title + favicon. Titles and favicons settle after load,
    // so a change in either records the visit again with the settled values.
    const seen = React.useRef(new Map<string, string>());
    React.useEffect(() => {
        const visited = tabs.filter((tab) => {
            const signature = `${tab.url}\n${tab.title}\n${tab.faviconUrl ?? ''}`;
            if (
                tab.loading ||
                tab.error ||
                !/^https?:/.test(tab.url) ||
                seen.current.get(tab.id) === signature
            ) {
                return false;
            }
            seen.current.set(tab.id, signature);
            return true;
        });
        if (visited.length) {
            saveHistory(mergeBrowserHistory(getHistory(), visited));
        }
    }, [tabs]);
    return history;
}

/** Forgets one address, the way Shift-Delete does on a history suggestion. */
export function removeBrowserHistoryEntry(url: string) {
    saveHistory(removeFromBrowserHistory(getHistory(), url));
}

export function removeFromBrowserHistory(previous: BrowserHistoryEntry[], url: string) {
    return previous.filter((entry) => entry.url !== url);
}

/**
 * Puts visited pages first, most recent last in `visited`, deduplicated by URL. A visit seen
 * before its favicon arrives keeps the icon already stored for that URL.
 */
export function mergeBrowserHistory(
    previous: BrowserHistoryEntry[],
    visited: BrowserHistoryEntry[]
) {
    const previousByUrl = new Map(previous.map((entry) => [entry.url, entry]));
    const visitedByUrl = new Map(
        visited.map(({ url, title, faviconUrl }) => [
            url,
            { faviconUrl: faviconUrl ?? previousByUrl.get(url)?.faviconUrl ?? null, title, url },
        ])
    );
    return [
        ...[...visitedByUrl.values()].reverse(),
        ...previous.filter((entry) => !visitedByUrl.has(entry.url)),
    ].slice(0, 50);
}

export function parseBrowserHistory(value: unknown): BrowserHistoryEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .flatMap((entry: unknown) => {
            if (
                !entry ||
                typeof entry !== 'object' ||
                !('url' in entry && typeof entry.url === 'string') ||
                !('title' in entry && typeof entry.title === 'string') ||
                !isHistoryUrl(entry.url)
            ) {
                return [];
            }
            const faviconUrl =
                'faviconUrl' in entry && isFaviconUrl(entry.faviconUrl) ? entry.faviconUrl : null;
            return [{ faviconUrl, title: entry.title, url: entry.url }];
        })
        .slice(0, 50);
}

let current: BrowserHistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getHistory() {
    current ??= readHistory();
    return current;
}

function saveHistory(next: BrowserHistoryEntry[]) {
    try {
        localStorage.setItem(historyKey, JSON.stringify(next));
    } catch (error) {
        toast.warning('Browser history stays in this window', {
            description: error instanceof Error ? error.message : 'Local storage is unavailable.',
        });
    }
    current = next;
    for (const listener of listeners) {
        listener();
    }
}

function readHistory(): BrowserHistoryEntry[] {
    try {
        return parseBrowserHistory(JSON.parse(localStorage.getItem(historyKey) ?? '[]'));
    } catch {
        return [];
    }
}

function isHistoryUrl(value: string) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
        return false;
    }
}
