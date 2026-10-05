import * as React from 'react';
import type { Navigator } from 'react-router-dom';
import {
    type DesktopTabsApi,
    useDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import type { TabNavigationPolicy } from '../../hooks/desktop-tabs/tab-navigation.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import { serverRoute } from '../servers/server-routes.ts';
import { createTabNavigator } from './tab-router.tsx';

/** What every desktop tab router shares: the window's Server and its own router. */
export interface DesktopShell {
    server: ServerDetail;
    /** The window router, for paths outside this Server (`/s`, another slug, `/invite/…`). */
    windowNavigate: (path: string, options: { replace: boolean }) => void;
}

export const DesktopShellContext = React.createContext<DesktopShell | null>(null);

export function useDesktopShell(): DesktopShell {
    const shell = React.use(DesktopShellContext);
    if (!shell) {
        throw new Error('Desktop tab routers render inside the desktop Server shell.');
    }
    return shell;
}

/**
 * A stable navigator for one tab. The tabs API changes with every state
 * change, so the navigator reads it through a ref: a new navigator would
 * re-render the whole page under that tab's `<Router>`.
 */
export function useTabNavigator(tabId: string, policy: TabNavigationPolicy): Navigator {
    const tabs = useDesktopTabs();
    const { server, windowNavigate } = useDesktopShell();
    const latest = React.useRef({ tabs, windowNavigate });
    latest.current = { tabs, windowNavigate };
    const slug = server.slug;
    return React.useMemo(
        () =>
            createTabNavigator({
                current: () => tabLocation(latest.current.tabs, tabId, slug),
                gesture: currentOpenGesture,
                policy,
                serverPath: serverRoute(slug),
                tabId,
                tabs: {
                    go: (id, delta) => latest.current.tabs.go(id, delta),
                    navigate: (id, location, mode) =>
                        latest.current.tabs.navigate(id, location, mode),
                    openInFocusedPane: (location, intent) =>
                        latest.current.tabs.openInFocusedPane(location, intent),
                    openLink: (id, location, intent) =>
                        latest.current.tabs.openLink(id, location, intent),
                },
                windowNavigate: (path, options) => latest.current.windowNavigate(path, options),
            }),
        [policy, slug, tabId]
    );
}

function tabLocation(tabs: DesktopTabsApi, tabId: string, slug: string): TabLocation {
    const tab = tabs.tab(tabId);
    return tab ? currentLocation(tab) : { kind: 'app', path: serverRoute(slug) };
}
