import type { BrowserHistoryEntry } from '../../hooks/browser/use-browser-history.ts';
import { classifyBrowserAddress, formatBrowserDisplayUrl } from './browser-address.ts';

/** A matched span, as `[start, end)` offsets into the text it marks. */
export type BrowserMatchRange = readonly [number, number];

/** One row under the address field. */
export type BrowserAddressSuggestion =
    | {
          /** What committing the typed text does: open it as an address, or search for it. */
          kind: 'go' | 'search';
          id: 'input';
          label: string;
          /** The text to navigate with; the toolbar resolves it. */
          value: string;
      }
    | {
          kind: 'history';
          id: string;
          entry: BrowserHistoryEntry;
          /** The condensed URL shown beside the title. */
          displayUrl: string;
          title: string;
          titleMatch: BrowserMatchRange | null;
          displayUrlMatch: BrowserMatchRange | null;
          value: string;
      };

export const browserAddressSuggestionLimit = 8;

/**
 * The rows under the focused address field. Untouched (`query` null), it lists recent history
 * minus the page already open. Once the user types, the first row commits the text itself and
 * history matches follow, ranked by where the text matches, then by recency. Recency is each
 * entry's unique position, so tied rows never reorder between keystrokes.
 */
export function selectBrowserAddressSuggestions({
    history,
    pageUrl,
    query,
}: {
    /** Most recent first. */
    history: BrowserHistoryEntry[];
    pageUrl: string;
    query: string | null;
}): BrowserAddressSuggestion[] {
    const entries = dedupeByUrl(history);
    const text = query?.trim() ?? '';
    if (query === null) {
        return entries
            .filter((entry) => entry.url !== pageUrl)
            .slice(0, browserAddressSuggestionLimit)
            .map((entry) => historyRow(entry, ''));
    }
    if (!text) {
        return [];
    }
    const intent = classifyBrowserAddress(text);
    const first: BrowserAddressSuggestion = {
        kind: intent.kind,
        id: 'input',
        label: intent.kind === 'go' ? `Go to ${text}` : `Search Google for “${text}”`,
        value: text,
    };
    const needle = text.toLowerCase();
    const matches = entries
        .map((entry, recency) => ({ entry, recency, tier: matchTier(entry, needle) }))
        .filter(
            (match): match is typeof match & { tier: number } =>
                match.tier !== null && match.entry.url !== intent.url
        )
        .sort((a, b) => a.tier - b.tier || a.recency - b.recency)
        .slice(0, browserAddressSuggestionLimit - 1)
        .map(({ entry }) => historyRow(entry, needle));
    return [first, ...matches];
}

/**
 * Where `needle` falls in an entry, best first: 0 at the start of the address (its host), 1 at
 * the start of a word in the title or address, 2 anywhere in the title or full URL.
 */
export function matchTier(entry: BrowserHistoryEntry, needle: string): number | null {
    const address = formatBrowserDisplayUrl(entry.url).toLowerCase();
    if (address.startsWith(needle)) {
        return 0;
    }
    const title = entry.title.toLowerCase();
    if (wordStart(title, needle) !== -1 || wordStart(address, needle) !== -1) {
        return 1;
    }
    if (title.includes(needle) || entry.url.toLowerCase().includes(needle)) {
        return 2;
    }
    return null;
}

/** The span to bold: the first word-start occurrence of `needle`, else its first occurrence. */
export function findBrowserMatch(text: string, needle: string): BrowserMatchRange | null {
    if (!needle) {
        return null;
    }
    const haystack = text.toLowerCase();
    const atWord = wordStart(haystack, needle);
    const start = atWord === -1 ? haystack.indexOf(needle) : atWord;
    return start === -1 ? null : [start, start + needle.length];
}

function historyRow(entry: BrowserHistoryEntry, needle: string): BrowserAddressSuggestion {
    const displayUrl = formatBrowserDisplayUrl(entry.url);
    const title = entry.title.trim() || displayUrl;
    return {
        kind: 'history',
        id: `history:${entry.url}`,
        entry,
        displayUrl,
        title,
        titleMatch: findBrowserMatch(title, needle),
        displayUrlMatch: title === displayUrl ? null : findBrowserMatch(displayUrl, needle),
        value: entry.url,
    };
}

function wordStart(haystack: string, needle: string) {
    for (let index = haystack.indexOf(needle); index !== -1; ) {
        if (index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1] ?? '')) {
            return index;
        }
        index = haystack.indexOf(needle, index + 1);
    }
    return -1;
}

function dedupeByUrl(history: BrowserHistoryEntry[]) {
    const seen = new Set<string>();
    return history.filter((entry) => !seen.has(entry.url) && seen.add(entry.url));
}
