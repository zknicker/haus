import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { useBrowserViews } from '../browser/browser-views-context.ts';
import {
    type HistoryDirection,
    pageHistoryStep,
    stepPageHistory,
} from '../browser/page-history-step.ts';
import {
    type HistorySteps,
    historyStepsFromKey,
    historyStepsKey,
    noHistorySteps,
} from '../shell/history-steps.ts';
import { useDesktopTabCommands, useDesktopTabsSelector } from './desktop-tabs-context.ts';
import { currentLocation, type DesktopTabsState, type PaneSide } from './desktop-tabs-model.ts';

/**
 * One desktop pane's Back and Forward (ADR 0039): they step the pane's shown
 * tab — a web page's own history first, then the tab's (`pageHistoryStep`) —
 * and follow it when the pane switches tabs, so each pane walks only its own
 * history. Re-renders only when that pane's steps change.
 */
export function usePaneHistory(pane: PaneSide) {
    const tabs = useDesktopTabCommands();
    const views = useBrowserViews();
    const key = useDesktopTabsSelector((state) =>
        historyStepsKey(paneHistorySteps(state, pane, views?.views ?? null))
    );
    const steps = historyStepsFromKey(key);
    const step = (direction: HistoryDirection) => {
        const tabId = tabs.store.snapshot()[pane]?.selectedTabId;
        if (tabId) {
            tabs.focusPane(pane);
            stepPageHistory({ direction, tabId, tabs, views });
        }
    };
    return {
        back: () => step('back'),
        canGoBack: steps.back,
        canGoForward: steps.forward,
        forward: () => step('forward'),
    };
}

/** Which way `pane`'s shown tab can step: its web page's own history first, then the tab's. */
export function paneHistorySteps(
    state: DesktopTabsState,
    pane: PaneSide,
    views: ReadonlyMap<string, Pick<BrowserTab, 'canGoBack' | 'canGoForward'>> | null
): HistorySteps {
    const tabId = state[pane]?.selectedTabId;
    const tab = tabId ? state.tabs[tabId] : undefined;
    if (!tab) {
        return noHistorySteps;
    }
    const location = currentLocation(tab);
    const view = location.kind === 'browser' ? (views?.get(location.viewId) ?? null) : null;
    const can = (direction: HistoryDirection) =>
        pageHistoryStep({ direction, history: tab.history, view }) !== null;
    return { back: can('back'), forward: can('forward') };
}
