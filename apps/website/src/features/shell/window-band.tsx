import type * as React from 'react';
import { useAppSidebarWidth } from '../../hooks/shell/use-app-sidebar-width.ts';

/**
 * The full-width window band of the Canvas and Band window layouts:
 * a leading segment exactly the sidebar's width that holds only the traffic
 * lights, then the workspace topbar (tab strip, page slot, band actions,
 * Settings) from the content column's edge on. The web keeps its
 * topbar inside the main column instead.
 */
export function WindowBand({
    children,
}: {
    /** The workspace topbar (ShellTopbar), passed as an element so a sidebar drag never re-renders it. */
    children: React.ReactNode;
}) {
    return (
        <div className="shell-window-band" data-window-drag-region="">
            <WindowBandLead />
            {children}
        </div>
    );
}

/** The one band part that follows the sidebar width at pointer rate during a resize. */
function WindowBandLead() {
    const sidebarWidth = useAppSidebarWidth();
    return (
        <div
            className="shell-window-band__lead"
            style={{ '--app-sidebar-width': `${sidebarWidth.width}px` } as React.CSSProperties}
        />
    );
}
