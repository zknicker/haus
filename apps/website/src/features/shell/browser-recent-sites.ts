import type { BrowserHistoryEntry } from '../../hooks/browser/use-browser-history.ts';

/** One tile on the new-tab page: a site the user visited recently. */
export interface BrowserRecentSite {
    faviconUrl: string | null;
    /** The page title, or the host when the page had none. */
    label: string;
    origin: string;
    /** The most recent page visited on this site; the tile reopens it. */
    url: string;
}

const recentSiteLimit = 8;

/**
 * Picks the new-tab page's recent sites from history (most recent first): one tile per origin,
 * reopening the latest page there. A site whose latest visit has no favicon yet borrows the
 * icon from an older visit to the same origin.
 */
export function selectRecentSites(history: BrowserHistoryEntry[]): BrowserRecentSite[] {
    const sites = new Map<string, BrowserRecentSite>();
    for (const entry of history) {
        const url = parseWebUrl(entry.url);
        if (!url) {
            continue;
        }
        const site = sites.get(url.origin);
        if (site) {
            site.faviconUrl ??= entry.faviconUrl;
            continue;
        }
        if (sites.size === recentSiteLimit) {
            continue;
        }
        sites.set(url.origin, {
            faviconUrl: entry.faviconUrl,
            label: entry.title.trim() || url.host.replace(/^www\./, ''),
            origin: url.origin,
            url: entry.url,
        });
    }
    return [...sites.values()];
}

function parseWebUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}
