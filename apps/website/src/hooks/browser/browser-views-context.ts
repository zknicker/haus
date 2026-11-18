import * as React from 'react';
import type { BrowserCommand, BrowserTab } from '../../lib/desktop-browser.ts';
import type { BrowserFind } from './use-browser-find.ts';
import type { BrowserHistoryEntry } from './use-browser-history.ts';

/**
 * The window's web views (ADR 0039), provided by `BrowserViewsProvider` on
 * desktop. Views are keyed by their App-chosen id, the `viewId` a browser
 * `TabLocation` names; a view absent here is not created yet or was destroyed
 * and restores by URL when its page mounts.
 */
export interface BrowserViews {
    command: (input: BrowserCommand) => void;
    /** Find in page, open on at most one view: the focused pane's web page. */
    find: BrowserFind;
    history: BrowserHistoryEntry[];
    /** Electron mounted this Server's workspace; pages may `open` their views. */
    ready: boolean;
    views: ReadonlyMap<string, BrowserTab>;
}

export const BrowserViewsContext = React.createContext<BrowserViews | null>(null);

/** Null on the web and outside the desktop tabs shell. */
export function useBrowserViews(): BrowserViews | null {
    return React.use(BrowserViewsContext);
}

/** One view's live page state (title, favicon, loading) for its tab's page and mark. */
export function useBrowserView(viewId: string): BrowserTab | null {
    return React.use(BrowserViewsContext)?.views.get(viewId) ?? null;
}

/** The address field of one view's toolbar; ⌘L focuses the focused pane's. */
export function browserAddressId(viewId: string): string {
    return `browser-address-${viewId}`;
}
