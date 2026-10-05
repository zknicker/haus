import * as React from 'react';
import {
    type DesktopTabsApi,
    useOptionalDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { useAppSidebarOpen } from '../../hooks/shell/use-app-sidebar-open.ts';
import { useAppSidebarWidth } from '../../hooks/shell/use-app-sidebar-width.ts';
import { TabRowsDrag } from './tab-drag/tab-rows-drag.tsx';
import { useSplitRowGeometry } from './use-split-row-geometry.ts';
import { WorkspaceTabStrip } from './workspace-tab-strip.tsx';

/**
 * The full-width window band of the Canvas and Band window layouts: a
 * leading segment exactly the sidebar's width that holds only the traffic
 * lights, then the tab rows (DesktopTabBand) from the content column's edge
 * on. The web keeps its topbar inside the main column instead.
 */
export function WindowBand({
    children,
}: {
    /** Band content before the desktop tabs provider mounts; ignored once it does. */
    children?: React.ReactNode;
}) {
    const tabs = useOptionalDesktopTabs();
    return (
        <div className="shell-window-band" data-window-drag-region="">
            <WindowBandLead />
            {tabs ? <DesktopTabBand tabs={tabs} /> : children}
        </div>
    );
}

/**
 * The desktop tab rows (ADR 0039): one row per pane, each as wide as its pane
 * below, so the second row starts on the divider's line.
 */
function DesktopTabBand({ tabs }: { tabs: DesktopTabsApi }) {
    const { primary, secondary } = tabs.state;
    const twoRows = secondary !== null;
    const band = React.useRef<HTMLElement | null>(null);
    useSplitRowGeometry(band, twoRows);
    return (
        <header
            className="workspace-titlebar app-shell-band"
            data-split={twoRows || undefined}
            data-window-drag-region=""
            ref={band}
        >
            <TabRowsDrag band={band}>
                {primary ? (
                    <WorkspaceTabStrip label={twoRows ? 'Left pane tabs' : 'Tabs'} pane="primary" />
                ) : null}
                {secondary ? <WorkspaceTabStrip label="Right pane tabs" pane="secondary" /> : null}
            </TabRowsDrag>
        </header>
    );
}

/**
 * The one band part that follows the sidebar width at pointer rate during a
 * resize; with the sidebar hidden it keeps just the traffic lights' room.
 */
function WindowBandLead() {
    const sidebarWidth = useAppSidebarWidth();
    const sidebarOpen = useAppSidebarOpen();
    return (
        <div
            className="shell-window-band__lead"
            data-sidebar-hidden={sidebarOpen ? undefined : ''}
            style={{ '--app-sidebar-width': `${sidebarWidth.width}px` } as React.CSSProperties}
        />
    );
}
