import { type BrowserOpenRequest, newBrowserViewId } from '../../lib/desktop-browser.ts';
import {
    currentLocation,
    type DesktopTabsState,
    type TabLocation,
} from '../desktop-tabs/desktop-tabs-model.ts';

export type BrowserTabLocation = Extract<TabLocation, { kind: 'browser' }>;

/**
 * A web page's open request as a tab gesture: Chrome's background-tab disposition (⌘- or
 * middle-click, Open Link in New Tab) is a background tab beside the page; every other
 * (`target=_blank`, a popup) is a plain Open in the right pane.
 */
export function browserOpenGesture(request: BrowserOpenRequest): 'auto' | 'backgroundTab' {
    return request.background ? 'backgroundTab' : 'auto';
}

/**
 * A new web tab's location, titled by host until it loads: a fresh view named by the App, or
 * the live popup view `viewId` Electron already opened.
 */
export function newBrowserLocation(url: string, viewId = newBrowserViewId()): BrowserTabLocation {
    return { kind: 'browser', title: new URL(url).hostname, url, viewId };
}

/** The tab whose current page is `viewId`, so a view's focus or popup maps to its tab. */
export function tabShowingView(state: DesktopTabsState, viewId: string): string | null {
    for (const tab of Object.values(state.tabs)) {
        const location = currentLocation(tab);
        if (location.kind === 'browser' && location.viewId === viewId) {
            return tab.id;
        }
    }
    return null;
}

/**
 * Views any open tab's history still names. A view outside this set belongs only to closed
 * tabs or entries trimmed off a history, so Electron destroys it; reopening restores by URL.
 */
export function referencedViewIds(state: DesktopTabsState): Set<string> {
    const ids = new Set<string>();
    for (const tab of Object.values(state.tabs)) {
        for (const { location } of tab.history.entries) {
            if (location.kind === 'browser') {
                ids.add(location.viewId);
            }
        }
    }
    return ids;
}

/** The current tab of the focused pane. */
export function focusedTabId(state: DesktopTabsState): string | null {
    return state[state.focusedPane]?.selectedTabId ?? null;
}

/** The focused pane's web page, which takes menu page actions, find, and ⌘L. */
export function focusedViewId(state: DesktopTabsState): string | null {
    const tabId = focusedTabId(state);
    const tab = tabId ? state.tabs[tabId] : undefined;
    const location = tab ? currentLocation(tab) : null;
    return location?.kind === 'browser' ? location.viewId : null;
}
