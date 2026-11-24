import * as React from 'react';
import { RouterProvider } from 'react-aria-components';
import { useNavigate } from 'react-router-dom';
import {
    type DesktopTabCommands,
    useOptionalDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { deltaBeforeRun } from '../../hooks/desktop-tabs/desktop-tabs-history.ts';
import { resolveActiveSection } from '../../routes/app/server-route-state.ts';

/**
 * The tab window chrome reads its page from (the focused pane's selected tab), provided by
 * `ShellTabRouter`. Null on the web.
 */
export const ShellTabIdContext = React.createContext<string | null>(null);

/**
 * The Settings rail is the Settings page's own drill-down, not the app sidebar (ADR 0046): on
 * desktop its links push onto the Settings tab it belongs to, like an Agent profile's
 * sections, so they never Go. The rail only shows while that tab is the one chrome reads.
 * The web keeps the shell's router.
 */
export function SettingsRailRouter({ children }: { children: React.ReactNode }) {
    const tabs = useOptionalDesktopTabs();
    const tabId = React.use(ShellTabIdContext);
    const navigate = React.useMemo(
        () => (tabs && tabId ? settingsRailNavigate(tabs, tabId) : null),
        [tabId, tabs]
    );
    return navigate ? <RouterProvider navigate={navigate}>{children}</RouterProvider> : children;
}

export function useSettingsRailNavigate() {
    const tabs = useOptionalDesktopTabs();
    const tabId = React.use(ShellTabIdContext);
    const navigate = useNavigate();
    return tabs && tabId ? settingsRailNavigate(tabs, tabId) : (path: string) => navigate(path);
}

/** The tab the rail belongs to, for modified clicks on its links; null on the web. */
export function useSettingsRailTabId(): string | null {
    const tabs = useOptionalDesktopTabs();
    const tabId = React.use(ShellTabIdContext);
    return tabs ? tabId : null;
}

/** A rail link: a push in the Settings tab itself. */
export function settingsRailNavigate(tabs: Pick<DesktopTabCommands, 'navigate'>, tabId: string) {
    return (path: string) => tabs.navigate(tabId, { kind: 'app', path }, 'push');
}

/**
 * Desktop Back in Settings: the tab steps back to the page before Settings, as in Capy; a tab
 * that started in Settings shows `fallback` in place. Null on the web, whose row is a link.
 */
export function useSettingsExit(slug: string, fallback: string): (() => void) | null {
    const tabs = useOptionalDesktopTabs();
    const tabId = React.use(ShellTabIdContext);
    if (!(tabs && tabId)) {
        return null;
    }
    return () => {
        const tab = tabs.tab(tabId);
        const delta = tab
            ? deltaBeforeRun(
                  tab.history,
                  (location) =>
                      location.kind === 'app' &&
                      resolveActiveSection(location.path, slug) === 'settings'
              )
            : null;
        if (delta === null) {
            tabs.navigate(tabId, { kind: 'app', path: fallback }, 'replace');
        } else {
            tabs.go(tabId, delta);
        }
    };
}
