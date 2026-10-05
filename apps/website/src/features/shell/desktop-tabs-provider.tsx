import type * as React from 'react';
import { DesktopTabsContext } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { TabLocation } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useDesktopTabShortcuts } from '../../hooks/desktop-tabs/use-desktop-tab-shortcuts.ts';
import { useDesktopTabsController } from '../../hooks/desktop-tabs/use-desktop-tabs-controller.ts';
import { inboxRoute } from '../servers/server-routes.ts';
import { useTabMenuBar } from './use-tab-menu-bar.ts';

/**
 * Desktop only: one window's tabs for one Server (ADR 0039). Provides
 * `DesktopTabsContext` and wires the tab shortcuts and the File and Tab menus
 * to the focused pane. Switching Servers remounts it, so each Server reads its
 * own stored tabs.
 */
export function DesktopTabsProvider({
    children,
    seed,
    serverId,
    slug,
}: {
    children: React.ReactNode;
    /** The route this window was opened with; used only when it has no tabs of its own yet. */
    seed: TabLocation | null;
    serverId: string;
    slug: string;
}) {
    return (
        <ServerTabs key={serverId} seed={seed} serverId={serverId} slug={slug}>
            {children}
        </ServerTabs>
    );
}

function ServerTabs({
    children,
    seed,
    serverId,
    slug,
}: {
    children: React.ReactNode;
    seed: TabLocation | null;
    serverId: string;
    slug: string;
}) {
    const home: TabLocation = { kind: 'app', path: inboxRoute(slug) };
    const tabs = useDesktopTabsController({ home, seed, serverId });
    useDesktopTabShortcuts(tabs);
    useTabMenuBar(tabs);
    return <DesktopTabsContext value={tabs}>{children}</DesktopTabsContext>;
}
