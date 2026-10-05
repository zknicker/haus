import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConnectionNotice } from '../../features/servers/connection-notice.tsx';
import { serverSearchRoute, serverSettingsRoute } from '../../features/servers/server-routes.ts';
import { BrowserViewsProvider } from '../../features/shell/browser-views-provider.tsx';
import { DesktopPanes } from '../../features/shell/desktop-panes.tsx';
import { DesktopTabFrame } from '../../features/shell/desktop-tab-frame.tsx';
import type { TabFramePlacement } from '../../features/shell/desktop-tab-placement.ts';
import { DesktopTabsProvider } from '../../features/shell/desktop-tabs-provider.tsx';
import { ShellTabRouter } from '../../features/shell/shell-tab-router.tsx';
import {
    createTabDragView,
    TabDragViewContext,
} from '../../features/shell/tab-drag/tab-drag-view.ts';
import { useDesktopTabWindow } from '../../features/shell/use-desktop-tab-window.ts';
import { type DesktopShell, DesktopShellContext } from '../../features/shell/use-tab-navigator.ts';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import { stepPageHistory } from '../../hooks/browser/page-history-step.ts';
import {
    useDesktopMenuNavigation,
    useDesktopTabHistory,
} from '../../hooks/desktop/use-desktop-menu-navigation.ts';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { focusedTabId } from '../../hooks/desktop-tabs/desktop-tabs-panes.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { windowSeedPath } from './desktop-page-paths.ts';
import { ServerShell } from './server-shell.tsx';

/**
 * The desktop Server window (ADR 0039): the window's tabs, its web views, the
 * chrome under the focused pane's tab router, and the one layer of mounted
 * tab frames over the panes. The window router keeps only the Server shell; every page routes
 * inside its tab.
 */
export function DesktopServerLayout(props: { serverError: boolean; server: ServerDetail }) {
    // Keyed by Server: each Server's tabs, views, and seed start fresh.
    return <ServerWindow key={props.server.id} {...props} />;
}

function ServerWindow({ serverError, server }: { serverError: boolean; server: ServerDetail }) {
    const windowLocation = useLocation();
    const windowNavigate = useNavigate();
    // Read once per Server: the window route seeds a window that has no tabs of its own yet.
    const [seed] = React.useState<TabLocation | null>(() => {
        const path = windowSeedPath(windowLocation, server.slug);
        return path ? { kind: 'app', path } : null;
    });
    const shell = React.useMemo<DesktopShell>(
        () => ({
            server,
            windowNavigate: (path, options) => windowNavigate(path, options),
        }),
        [server, windowNavigate]
    );
    // One tab drag view per window: the band's rows and the body's tab layer both draw from it.
    const [dragView] = React.useState(createTabDragView);
    return (
        <DesktopTabsProvider seed={seed} serverId={server.id} slug={server.slug}>
            <BrowserViewsProvider serverId={server.id}>
                <DesktopShellContext value={shell}>
                    <TabDragViewContext value={dragView}>
                        <DesktopWindow server={server} serverError={serverError} />
                    </TabDragViewContext>
                </DesktopShellContext>
            </BrowserViewsProvider>
        </DesktopTabsProvider>
    );
}

function DesktopWindow({ serverError, server }: { serverError: boolean; server: ServerDetail }) {
    // Built once per input: tab changes re-render the shell router, not the chrome.
    const chrome = React.useMemo(
        () => (
            <ServerShell
                main={
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <ConnectionNotice serverError={serverError} serverId={server.id} />
                        <DesktopPanes renderTab={renderTab} />
                    </div>
                }
                server={server}
                topbarInWindow
            />
        ),
        [serverError, server]
    );
    return (
        <>
            <DesktopTabEffects slug={server.slug} />
            <ShellTabRouter>{chrome}</ShellTabRouter>
        </>
    );
}

/** Window-level tab wiring, apart so tab changes never re-render the chrome. */
function DesktopTabEffects({ slug }: { slug: string }) {
    useDesktopTabWindow(useLocation(), slug);
    useDesktopTabCommands(slug);
    return null;
}

function renderTab(tabId: string, placement: TabFramePlacement) {
    return <DesktopTabFrame tabId={tabId} {...placement} />;
}

/** The native menu's Settings… and Find…, and the Go menu, act on the focused pane. */
function useDesktopTabCommands(slug: string) {
    const tabs = useDesktopTabs();
    const browser = useBrowserViews();
    const latest = React.useRef({ browser, tabs });
    latest.current = { browser, tabs };
    const reveal = React.useCallback(
        (path: string) => latest.current.tabs.reveal({ kind: 'app', path }),
        []
    );
    const routes = React.useMemo(
        () => ({ searchRoute: serverSearchRoute(slug), settingsRoute: serverSettingsRoute(slug) }),
        [slug]
    );
    useDesktopMenuNavigation(routes, reveal);
    const followHistory = React.useCallback((direction: 'back' | 'forward') => {
        const { browser: views, tabs: current } = latest.current;
        const tabId = focusedTabId(current.state);
        if (tabId) {
            stepPageHistory({ direction, tabId, tabs: current, views });
        }
    }, []);
    useDesktopTabHistory(followHistory);
}
