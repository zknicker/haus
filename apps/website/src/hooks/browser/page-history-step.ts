import type { BrowserTab } from '../../lib/desktop-browser.ts';
import type { DesktopTabsApi } from '../desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type TabHistory } from '../desktop-tabs/desktop-tabs-model.ts';
import type { BrowserViews } from './browser-views-context.ts';

export type HistoryDirection = 'back' | 'forward';

/** What Back or Forward does in a tab: walk the web page's own history, the tab's, or nothing. */
export type PageHistoryStep = { kind: 'view' } | { kind: 'tab'; delta: -1 | 1 } | null;

/**
 * A web page walks its own history first; past its start, the tab's (ADR 0039).
 * So a site chosen on the new tab page, or a web page the sidebar replaced,
 * steps back to the page before it.
 */
export function pageHistoryStep(input: {
    direction: HistoryDirection;
    history: TabHistory;
    view: Pick<BrowserTab, 'canGoBack' | 'canGoForward'> | null;
}): PageHistoryStep {
    const { direction, history, view } = input;
    const back = direction === 'back';
    if (view && (back ? view.canGoBack : view.canGoForward)) {
        return { kind: 'view' };
    }
    const delta = back ? -1 : 1;
    const index = history.index + delta;
    return index >= 0 && index < history.entries.length ? { kind: 'tab', delta } : null;
}

/** ⌘[ / ⌘] and the toolbar arrows: steps `tabId` by `pageHistoryStep`. */
export function stepPageHistory(input: {
    direction: HistoryDirection;
    tabId: string;
    tabs: Pick<DesktopTabsApi, 'go' | 'tab'>;
    views: BrowserViews | null;
}) {
    const { direction, tabId, tabs, views } = input;
    const tab = tabs.tab(tabId);
    if (!tab) {
        return;
    }
    const location = currentLocation(tab);
    const view = location.kind === 'browser' ? (views?.views.get(location.viewId) ?? null) : null;
    const step = pageHistoryStep({ direction, history: tab.history, view });
    if (step?.kind === 'view' && view) {
        views?.command({ kind: 'navigate', action: direction, id: view.id });
    } else if (step?.kind === 'tab') {
        tabs.go(tabId, step.delta);
    }
}
