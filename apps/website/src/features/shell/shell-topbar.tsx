import * as React from 'react';
import { createPortal } from 'react-dom';
import { useSidePaneShownWidth } from '../../hooks/workspace-tabs/use-side-pane-width.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace, useCoveringTabSelected } from './browser-workspace-context.tsx';
import { PrimaryPageTitle, PrimaryWorkspaceTab } from './primary-workspace-tab.tsx';
import { WorkspaceBandTabLabel } from './workspace-band-tab-label.ts';
import { WorkspaceLayoutControls } from './workspace-layout-controls.tsx';
import { WorkspaceTabStrip } from './workspace-tab-strip.tsx';

interface TopbarSlot {
    actionsContainer: HTMLElement | null;
    container: HTMLElement | null;
    setActionsContainer: (element: HTMLElement | null) => void;
    setContainer: (element: HTMLElement | null) => void;
}

const TopbarContext = React.createContext<TopbarSlot | null>(null);

/** Owns the shell topbar slots; wrap the layout that renders ShellTopbar. */
export function TopbarProvider({ children }: { children: React.ReactNode }) {
    const [container, setContainer] = React.useState<HTMLElement | null>(null);
    const [actionsContainer, setActionsContainer] = React.useState<HTMLElement | null>(null);
    const slot = React.useMemo<TopbarSlot>(
        () => ({ actionsContainer, container, setActionsContainer, setContainer }),
        [actionsContainer, container]
    );
    return <TopbarContext value={slot}>{children}</TopbarContext>;
}

/**
 * The shell's one topbar band. Pages fill it through PageTopbar; the band
 * (and its height) render even while a page registers nothing, so chrome
 * never jumps between routes. On desktop it sits in the window band
 * (WindowBand): in split mode the routed page's title, its band content and
 * actions (expanded mode shows those actions only while the primary tab is
 * selected), then the side pane's strip starting at the pane's edge; in
 * expanded mode one strip, primary tab first. The layout controls end the
 * band; Settings lives in the sidebar footer. On the web it is the main
 * column's top band.
 */
export function ShellTopbar() {
    const slot = React.use(TopbarContext);
    const workspace = useBrowserWorkspace();
    const covering = useCoveringTabSelected();
    if (workspace && isWindowBand(workspace)) {
        return (
            <header className="workspace-titlebar app-shell-band" data-window-drag-region="">
                {workspace.mode === 'expanded' ? (
                    <WorkspaceTabStrip label="Workspace tabs" leading={<PrimaryWorkspaceTab />} />
                ) : (
                    <PrimaryPageTitle />
                )}
                <div className="workspace-page-slot" ref={slot?.setContainer} />
                {/* The routed page's actions; hidden (still mounted) while an expanded tab covers it. */}
                <div
                    className="workspace-band-actions no-drag"
                    hidden={covering}
                    ref={slot?.setActionsContainer}
                />
                <WorkspaceBandTrail
                    end={<WorkspaceLayoutControls />}
                    sideStrip={<WorkspaceTabStrip label="Side pane tabs" />}
                />
            </header>
        );
    }
    return (
        <header
            className="app-shell-band flex h-[var(--app-shell-band-height)] shrink-0 items-center px-3"
            data-window-drag-region=""
        >
            <div className="flex min-w-0 flex-1 items-center" ref={slot?.setContainer} />
        </header>
    );
}

/**
 * The band's end. While the side pane shows, it is exactly as wide as the pane
 * (plus the card's inset), so the pane's strip starts over the pane's edge;
 * it follows the pane width at drag rate on its own.
 */
function WorkspaceBandTrail({
    end,
    sideStrip,
}: {
    end: React.ReactNode;
    sideStrip: React.ReactNode;
}) {
    const shown = useBrowserWorkspace()?.sidePaneShown ?? false;
    const width = useSidePaneShownWidth();
    return (
        <div
            className="workspace-band-trail"
            data-side-pane={shown || undefined}
            style={
                shown
                    ? ({ '--workspace-side-pane-width': `${width}px` } as React.CSSProperties)
                    : undefined
            }
        >
            {shown ? sideStrip : null}
            <div className="workspace-band-end no-drag">{end}</div>
        </div>
    );
}

/**
 * Whether the topbar is the desktop window band — the tab area — rather than
 * the web's content-column band. Content that names where you are inside a
 * page (a breadcrumb) belongs to the page, not to the tabs, so it renders in
 * the content column when this is true.
 */
export function useTopbarIsWindowBand(): boolean {
    return isWindowBand(useBrowserWorkspace());
}

/**
 * Portals its children into the shell topbar band. Render one per routed
 * page; children compose SectionHeader (or any band content) as usual.
 */
export function PageTopbar({ children }: { children: React.ReactNode }) {
    const slot = React.use(TopbarContext);
    const workspace = useBrowserWorkspace();

    if (!slot?.container) {
        return null;
    }

    const tabLabel = workspace && isWindowBand(workspace) ? workspace.primaryTab.label : null;
    return createPortal(
        <WorkspaceBandTabLabel value={tabLabel}>{children}</WorkspaceBandTabLabel>,
        slot.container
    );
}

/**
 * Portals a page's actions into the desktop band, after its band content —
 * the chat's actions menu sits at the routed page's top-right corner. Renders
 * nothing outside the desktop band, where pages keep their actions in their
 * band content.
 */
export function WorkspaceBandActions({ children }: { children: React.ReactNode }) {
    const slot = React.use(TopbarContext);

    if (!slot?.actionsContainer) {
        return null;
    }

    return createPortal(children, slot.actionsContainer);
}

function isWindowBand(workspace: ReturnType<typeof useBrowserWorkspace>): boolean {
    return Boolean(workspace && getDesktopBridge()?.browserCommand);
}
