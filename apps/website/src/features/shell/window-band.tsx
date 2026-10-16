import * as React from 'react';
import {
    useDesktopTabs,
    useOptionalDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { useAppSidebarOpen } from '../../hooks/shell/use-app-sidebar-open.ts';
import { useAppSidebarWidth } from '../../hooks/shell/use-app-sidebar-width.ts';
import { HalloweenSky } from './halloween-sky.tsx';
import { WindowHistoryButtons } from './history-buttons.tsx';
import { TabRowsDrag } from './tab-drag/tab-rows-drag.tsx';
import { useSplitRowGeometry } from './use-split-row-geometry.ts';
import { WorkspaceTabStrip } from './workspace-tab-strip.tsx';

/**
 * The full-width window band of the Canvas and Band window layouts: a
 * leading segment exactly the sidebar's width that holds the traffic lights
 * and the window's Back and Forward, then the tab rows (DesktopTabBand) from the content column's edge
 * on. The web keeps its topbar inside the main column instead.
 */
export function WindowBand({
    children,
}: {
    /** Band content before the desktop tabs provider mounts; ignored once it does. */
    children?: React.ReactNode;
}) {
    const desktop = useOptionalDesktopTabs() !== null;
    // The window's one drag region; its controls opt out on themselves (shell.css).
    return (
        <div className="shell-window-band" data-window-drag-region="">
            <WindowBandLead>{desktop ? <WindowHistoryButtons /> : null}</WindowBandLead>
            {desktop ? <DesktopTabBand /> : children}
        </div>
    );
}

/**
 * The desktop tab rows (ADR 0039): one row per pane, each as wide as its pane
 * below, so the second row starts on the divider's line.
 */
function DesktopTabBand() {
    const { primary, secondary } = useDesktopTabs().state;
    const twoRows = secondary !== null;
    const band = React.useRef<HTMLElement | null>(null);
    useSplitRowGeometry(band, twoRows);
    return (
        <header
            className="workspace-titlebar app-shell-band"
            data-split={twoRows || undefined}
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
 * resize: the traffic lights, then the window's Back and Forward at its end,
 * just left of the sidebar's edge. With the sidebar hidden it shrinks to the
 * traffic lights' room plus the chevrons, which keep their place beside them.
 */
function WindowBandLead({ children }: { children: React.ReactNode }) {
    const sidebarWidth = useAppSidebarWidth();
    const sidebarOpen = useAppSidebarOpen();
    return (
        <div
            className="shell-window-band__lead app-shell-band"
            data-sidebar-hidden={sidebarOpen ? undefined : ''}
            style={{ '--app-sidebar-width': `${sidebarWidth.width}px` } as React.CSSProperties}
        >
            <HalloweenSky placement="band" />
            {children}
        </div>
    );
}
