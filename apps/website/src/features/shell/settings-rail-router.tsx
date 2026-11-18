import * as React from 'react';
import { RouterProvider } from 'react-aria-components';
import {
    type DesktopTabCommands,
    useOptionalDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';

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
