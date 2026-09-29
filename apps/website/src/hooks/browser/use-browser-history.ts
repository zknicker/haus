import { toast } from '@heroui/react';
import * as React from 'react';
import type { BrowserTab } from '../../lib/desktop-browser.ts';

export interface BrowserHistoryEntry {
    title: string;
    url: string;
}
const historyKey = 'haus.browser.history';

export function useBrowserHistory(tabs: BrowserTab[]) {
    const [history, setHistory] = React.useState<BrowserHistoryEntry[]>(() => readHistory());
    const seen = React.useRef(new Map<string, string>());
    React.useEffect(() => {
        const visited = tabs.filter((tab) => {
            if (
                tab.loading ||
                tab.error ||
                !/^https?:/.test(tab.url) ||
                seen.current.get(tab.id) === tab.url
            ) {
                return false;
            }
            seen.current.set(tab.id, tab.url);
            return true;
        });
        if (!visited.length) {
            return;
        }
        const next = mergeBrowserHistory(history, visited);
        try {
            localStorage.setItem(historyKey, JSON.stringify(next));
        } catch (error) {
            toast.warning('Browser history stays in this window', {
                description:
                    error instanceof Error ? error.message : 'Local storage is unavailable.',
            });
        }
        setHistory(next);
    }, [tabs, history]);
    return history;
}

export function mergeBrowserHistory(
    previous: BrowserHistoryEntry[],
    visited: BrowserHistoryEntry[]
) {
    const visitedByUrl = new Map(visited.map(({ url, title }) => [url, { url, title }]));
    const urls = new Set(visitedByUrl.keys());
    return [
        ...[...visitedByUrl.values()].reverse(),
        ...previous.filter((entry) => !urls.has(entry.url)),
    ].slice(0, 50);
}

function readHistory(): BrowserHistoryEntry[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .filter((entry): entry is BrowserHistoryEntry => {
                if (!entry || typeof entry.url !== 'string' || typeof entry.title !== 'string') {
                    return false;
                }
                try {
                    const url = new URL(entry.url);
                    return (
                        ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
                    );
                } catch {
                    return false;
                }
            })
            .slice(0, 50);
    } catch {
        return [];
    }
}
