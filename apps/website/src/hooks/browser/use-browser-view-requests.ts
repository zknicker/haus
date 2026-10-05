import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { parseBrowserOpenRequest } from '../../lib/desktop-browser.ts';
import type { DesktopTabsApi } from '../desktop-tabs/desktop-tabs-context.ts';
import { paneOfTab } from '../desktop-tabs/desktop-tabs-model.ts';
import type { OpenGesture } from '../desktop-tabs/tab-open-gesture.ts';
import {
    browserOpenGesture,
    focusedTabId,
    newBrowserLocation,
    tabShowingView,
} from './browser-view-tabs.ts';
import { useBrowserWorkspaceLinks } from './use-browser-workspace-links.ts';

/**
 * Turns web links into tabs placed by the ADR 0039 rule and keeps pane focus
 * in step with native key focus:
 *
 * - A web link always opens a new tab, from its opener's tab: beside it with
 *   one pane, after the other pane's current tab with two (the opener rule,
 *   `openLink`). Chrome's dispositions decide selection: ⌘- or middle-click
 *   and the page menu's Open Link in New Tab open it in the background;
 *   ⌘⇧-click, ⇧-click, `target=_blank`, a page's popup, and a plain App web
 *   link open it selected.
 * - A page's request carries its opener view; an App web link opens from the
 *   focused pane's current tab.
 * - A web view taking key focus focuses its tab's pane.
 */
export function useBrowserViewRequests(tabs: DesktopTabsApi) {
    const latest = React.useRef(tabs);
    latest.current = tabs;
    const openUrl = React.useCallback(
        (url: string, gesture: OpenGesture, openerViewId: string | null = null) => {
            const api = latest.current;
            const opener = openerViewId ? tabShowingView(api.state, openerViewId) : null;
            const from = opener ?? focusedTabId(api.state);
            const location = newBrowserLocation(url);
            if (from) {
                api.openLink(from, location, gesture);
            } else {
                api.openInFocusedPane(location, 'newTab');
            }
        },
        []
    );
    useBrowserWorkspaceLinks(openUrl);
    React.useEffect(() => {
        const bridge = getDesktopBridge();
        const stopRequests = bridge?.onBrowserOpenRequest?.((value) => {
            const request = parseBrowserOpenRequest(value);
            if (request) {
                openUrl(request.url, browserOpenGesture(request), request.openerId);
            }
        });
        const stopFocus = bridge?.onBrowserFocus?.((viewId) => {
            const { state, focusPane } = latest.current;
            const tabId = typeof viewId === 'string' ? tabShowingView(state, viewId) : null;
            const pane = tabId ? paneOfTab(state, tabId) : null;
            if (pane) {
                focusPane(pane);
            }
        });
        return () => {
            stopRequests?.();
            stopFocus?.();
        };
    }, [openUrl]);
}
