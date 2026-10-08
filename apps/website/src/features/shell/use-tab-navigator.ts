import * as React from 'react';
import type { Navigator } from 'react-router-dom';
import {
    type DesktopTabCommands,
    useDesktopTabCommands,
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
 * A stable navigator for one tab. It reads tabs through the stable commands,
 * never the rendered state: a new navigator, or a re-render here, would
 * re-render the whole page under that tab's `<Router>`.
 */
export function useTabNavigator(tabId: string, policy: TabNavigationPolicy): Navigator {
    const tabs = useDesktopTabCommands();
    const { server, windowNavigate } = useDesktopShell();
    const latest = React.useRef(windowNavigate);
    latest.current = windowNavigate;
    const slug = server.slug;
    return React.useMemo(
        () =>
            createTabNavigator({
                current: () => tabLocation(tabs, tabId, slug),
                gesture: currentOpenGesture,
                policy,
                serverPath: serverRoute(slug),
                tabId,
                tabs,
                windowNavigate: (path, options) => latest.current(path, options),
            }),
        [policy, slug, tabId, tabs]
    );
}

function tabLocation(tabs: DesktopTabCommands, tabId: string, slug: string): TabLocation {
    const tab = tabs.tab(tabId);
    return tab ? currentLocation(tab) : { kind: 'app', path: serverRoute(slug) };
}
