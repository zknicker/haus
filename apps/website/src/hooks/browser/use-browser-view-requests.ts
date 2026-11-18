import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { parseBrowserOpenRequest } from '../../lib/desktop-browser.ts';
import type { DesktopTabsApi } from '../desktop-tabs/desktop-tabs-context.ts';
import { paneOfTab } from '../desktop-tabs/desktop-tabs-model.ts';
import { openWithGesture } from '../desktop-tabs/tab-navigation.ts';
import { browserOpenGesture, newBrowserLocation, tabShowingView } from './browser-view-tabs.ts';
import { useBrowserWorkspaceLinks, type WebLinkOpen } from './use-browser-workspace-links.ts';

/**
 * Turns web links into tabs by the ADR 0039 verbs and keeps pane focus in step
 * with native key focus:
 *
 * - A plain web link is Open: a new selected web tab in the right pane (stacking
 *   there when the link is in the right pane). ⌘- or middle-click and a page
 *   menu's Open Link in New Tab open a background tab beside the source; ⇧ a
 *   selected one there.
 * - The source is the link's own tab: an App link's tab, or the tab showing the
 *   requesting web view.
 * - A popup Electron already opened (`viewId`) becomes the new tab's page, keeping its opener.
 * - A web view taking key focus focuses its tab's pane.
 * - A page closing itself (`window.close()`) closes the tab showing it, as in Chrome.
 */
export function useBrowserViewRequests(tabs: DesktopTabsApi) {
    const latest = React.useRef(tabs);
    latest.current = tabs;
    const openUrl = React.useCallback((request: WebLinkOpen, viewId?: string) => {
        openWithGesture(
            latest.current,
            request.fromTabId,
            newBrowserLocation(request.url, viewId),
            request.gesture
        );
    }, []);
    useBrowserWorkspaceLinks(openUrl);
    React.useEffect(() => {
        const bridge = getDesktopBridge();
        const stopRequests = bridge?.onBrowserOpenRequest?.((value) => {
            const request = parseBrowserOpenRequest(value);
            if (request) {
                const { state } = latest.current;
                openUrl(
                    {
                        fromTabId: request.openerId
                            ? tabShowingView(state, request.openerId)
                            : null,
                        gesture: browserOpenGesture(request),
                        url: request.url,
                    },
                    request.viewId ?? undefined
                );
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
        const stopClosed = bridge?.onBrowserClosed?.((viewId) => {
            const { state, close } = latest.current;
            const tabId = typeof viewId === 'string' ? tabShowingView(state, viewId) : null;
            if (tabId) {
                close([tabId]);
            }
        });
        return () => {
            stopRequests?.();
            stopFocus?.();
            stopClosed?.();
        };
    }, [openUrl]);
}
