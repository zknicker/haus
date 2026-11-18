import type * as React from 'react';
import { Route, Routes } from 'react-router-dom';
import { useDesktopTabsSelector } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentEntry } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { focusedTabId } from '../../hooks/desktop-tabs/desktop-tabs-panes.ts';
import { serverRoute } from '../servers/server-routes.ts';
import { ShellTabIdContext } from './settings-rail-router.tsx';
import { IsolatedTabRouter } from './tab-router.tsx';
import { useDesktopShell, useTabNavigator } from './use-tab-navigator.ts';

/**
 * Window chrome on desktop (sidebar, command menu) reads its page from the
 * focused pane's current tab (ADR 0039), so the sidebar's selection follows the
 * tab you are in. Its `navigate` is always Go: the left pane's selected tab
 * navigates, whichever pane is focused, and never jumps to another tab on that
 * page. Command-, Shift-, or middle-click opens a new tab after the left pane's
 * selected tab. The Settings rail is that tab's own drill-down and routes
 * through it instead (`SettingsRailRouter`, fed by `ShellTabIdContext`). A web
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
            <ShellTabIdContext value={tabId}>
                <Routes>
                    <Route element={children} path="s/:slug/*" />
                </Routes>
            </ShellTabIdContext>
        </IsolatedTabRouter>
    );
}
