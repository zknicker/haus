import * as React from 'react';
import type { PaneSide } from './desktop-tabs-model.ts';

/**
 * Where a page sits, provided by the tab frame around each mounted tab. Pages
 * read it instead of guessing from the window: unread clearing, autofocus,
 * keyboard ownership, and scroll restore all key off it.
 *
 * Viewing in focus (ADR 0038 The Inbox Is Unread, read with ADR 0039): a tab
 * counts when it is `shown` in a focused, visible window, in either pane. A
 * mounted hidden tab never counts.
 */
export interface TabPresence {
    /** The pane the person last interacted with holds this tab. */
    focusedPane: boolean;
    pane: PaneSide | null;
    /** On screen (selected in its pane). */
    shown: boolean;
    tabId: string | null;
}

/** The web App and anything outside a tab frame: always shown, never a tab. */
export const routedPagePresence: TabPresence = {
    focusedPane: true,
    pane: null,
    shown: true,
    tabId: null,
};

export const TabPresenceContext = React.createContext<TabPresence>(routedPagePresence);

export function useTabPresence(): TabPresence {
    return React.use(TabPresenceContext);
}
