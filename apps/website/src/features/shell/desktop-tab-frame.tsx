import * as React from 'react';
import { RouterProvider } from 'react-aria-components';
import { Outlet, type RouteObject, useNavigate, useRoutes } from 'react-router-dom';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentEntry, type TabHistoryEntry } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { type TabPresence, TabPresenceContext } from '../../hooks/desktop-tabs/tab-presence.ts';
import { serverPageRoutes } from '../../routes/app/server-page-routes.tsx';
import { BrowserTabPage } from './browser-tab-page.tsx';
import { usePaneFocus } from './desktop-tab-layer.tsx';
import type { TabFramePlacement } from './desktop-tab-placement.ts';
import { NewTabPage } from './new-tab-page.tsx';
import { ShellFrame, SidePaneProvider } from './shell-side-pane.tsx';
import { ShellTopbar, TopbarProvider } from './shell-topbar.tsx';
import { TabErrorBoundary } from './tab-error-boundary.tsx';
import { IsolatedTabRouter } from './tab-router.tsx';
import { useDesktopShell, useTabNavigator } from './use-tab-navigator.ts';
import { useTabScrollMemory } from './use-tab-scroll-memory.ts';

/**
 * One mounted desktop tab (ADR 0039), drawn in the window's tab layer over
 * its pane's rect (`placement.pane`, see `DesktopTabLayer`). A hidden tab
 * stays mounted inside `<Activity mode="hidden">`: its state and DOM stay,
 * its effects are torn down, so it holds no subscriptions, marks nothing
 * read, and takes no keys. `visible` drives the Activity (a drag may preview
 * a tab onto the screen); only a committed, `shown` tab counts as viewing.
 * The frame provides the tab's presence, its own router over the Server page
 * table, the page's topbar band, an error boundary, and scroll memory.
 *
 * Memoized on primitive props: a pane divider drag re-renders the panes every
 * frame, and that must not re-render every tab's page under them.
 */
export const DesktopTabFrame = React.memo(function DesktopTabFrame({
    focusedPane,
    pane,
    shown,
    tabId,
    visible,
}: TabFramePlacement & { tabId: string }) {
    const tabs = useDesktopTabs();
    const tab = tabs.tab(tabId);
    const focus = usePaneFocus(pane);
    const presence = React.useMemo<TabPresence>(
        () => ({ focusedPane, pane, shown, tabId }),
        [focusedPane, pane, shown, tabId]
    );
    const frame = React.useRef<HTMLDivElement>(null);
    const entry = tab ? currentEntry(tab) : null;
    useTabScrollMemory(frame, { entryKey: entry?.key ?? '', shown: visible, tabId });
    if (!entry) {
        return null;
    }
    return (
        <React.Activity mode={visible ? 'visible' : 'hidden'}>
            <TabPresenceContext value={presence}>
                <div
                    className="desktop-tab-frame"
                    data-desktop-tab-id={tabId}
                    data-frame-pane={pane}
                    onFocusCapture={focus}
                    onPointerDownCapture={focus}
                    ref={frame}
                >
                    <TabPage entry={entry} tabId={tabId} />
                </div>
            </TabPresenceContext>
        </React.Activity>
    );
});

function TabPage({ entry, tabId }: { entry: TabHistoryEntry; tabId: string }) {
    const { location } = entry;
    if (location.kind === 'browser') {
        // Keyed by view, not entry: the page writes its settled address back as a replace.
        return (
            <BrowserTabPage
                className="min-h-0 flex-1"
                key={location.viewId}
                location={location}
                tabId={tabId}
            />
        );
    }
    if (location.kind === 'newTab') {
        return <NewTabPage className="min-h-0 flex-1" tabId={tabId} />;
    }
    return <AppTabPage entryKey={entry.key} path={location.path} tabId={tabId} />;
}

function AppTabPage({ entryKey, path, tabId }: { entryKey: string; path: string; tabId: string }) {
    const navigator = useTabNavigator(tabId, 'page');
    return (
        <IsolatedTabRouter entryKey={entryKey} location={path} navigator={navigator}>
            <TabLinkRouter>
                {/* Each tab owns its topbar and side-pane slots, so a page's band
                    content and panes never land in another tab. */}
                <TopbarProvider>
                    <ShellTopbar />
                    <SidePaneProvider>
                        <ShellFrame>
                            <TabErrorBoundary resetKey={entryKey}>
                                <TabRoutes />
                            </TabErrorBoundary>
                        </ShellFrame>
                    </SidePaneProvider>
                </TopbarProvider>
            </TabLinkRouter>
        </IsolatedTabRouter>
    );
}

/** HeroUI links (`href` on a menu item or Link) navigate this tab, not the sidebar's. */
function TabLinkRouter({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    return <RouterProvider navigate={(href) => navigate(href)}>{children}</RouterProvider>;
}

function TabRoutes() {
    return useRoutes(tabRoutes);
}

function TabServerOutlet() {
    const { server } = useDesktopShell();
    const context = React.useMemo(() => ({ server }), [server]);
    return <Outlet context={context} />;
}

// Built once: each route's component identity must survive re-renders.
const tabRoutes: RouteObject[] = [
    {
        path: 's/:slug',
        element: <TabServerOutlet />,
        children: serverPageRoutes({ desktop: true }),
    },
];
