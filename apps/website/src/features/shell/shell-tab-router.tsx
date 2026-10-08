import type * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { useDesktopTabsSelector } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentEntry } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { focusedTabId } from '../../hooks/desktop-tabs/desktop-tabs-panes.ts';
import { serverRoute } from '../servers/server-routes.ts';
import { IsolatedTabRouter } from './tab-router.tsx';
import { useDesktopShell, useTabNavigator } from './use-tab-navigator.ts';

/**
 * Window chrome on desktop (sidebar, command menu, settings rail) routes
 * through the focused pane's current tab (ADR 0039). Its `useLocation` is that
 * tab's page, so the sidebar's selection follows the tab you are in, and its
 * `navigate` goes to a place (an existing tab on that page, else that tab
 * unless it shows a web page); Command-, Shift-, or middle-click opens a new tab there. A web
 * page tab reads as the Server root, so nothing in the sidebar is selected.
 *
 * Children match `s/:slug/*`, so `useParams().slug` keeps working in chrome.
 */
export function ShellTabRouter({ children }: { children: React.ReactNode }) {
    const { server } = useDesktopShell();
    // The focused tab's entry only: other tabs' changes leave window chrome alone.
    const tabId = useDesktopTabsSelector(focusedTabId);
    const entry = useDesktopTabsSelector((state) => {
        const tab = tabId ? state.tabs[tabId] : undefined;
        return tab ? currentEntry(tab) : null;
    });
    const path = entry?.location.kind === 'app' ? entry.location.path : serverRoute(server.slug);
    const navigator = useTabNavigator(tabId ?? '', 'shell');
    return (
        <IsolatedTabRouter entryKey={entry?.key ?? 'shell'} location={path} navigator={navigator}>
            <Routes>
                <Route element={children} path="s/:slug/*" />
            </Routes>
        </IsolatedTabRouter>
    );
}
