import * as React from 'react';
import { createPortal } from 'react-dom';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { WorkspaceBandTabLabel } from './workspace-band-tab-label.ts';
import { WorkspaceSplitToggle } from './workspace-split-pane.tsx';
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
 * (WindowBand) and is the workspace tab strip: every tab in one sortable
 * list, then the page's band content, its actions, the split toggle, and the
 * global `trailingAction` (Settings) at the band's end. On the web it is the main
 * column's top band.
 */
export function ShellTopbar({ trailingAction }: { trailingAction?: React.ReactNode } = {}) {
    const slot = React.use(TopbarContext);
    if (getDesktopBridge()?.browserCommand) {
        return (
            <header className="workspace-titlebar app-shell-band" data-window-drag-region="">
                <WorkspaceTabStrip />
                <div className="workspace-page-slot" ref={slot?.setContainer} />
                <div className="workspace-band-end no-drag">
                    <div className="workspace-band-actions" ref={slot?.setActionsContainer} />
                    <WorkspaceSplitToggle />
                    {trailingAction}
                </div>
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
 * Portals its children into the shell topbar band. Render one per routed
 * page; children compose SectionHeader (or any band content) as usual.
 */
export function PageTopbar({ children }: { children: React.ReactNode }) {
    const slot = React.use(TopbarContext);
    const workspace = useBrowserWorkspace();

    if (!slot?.container) {
        return null;
    }

    const tabLabel =
        workspace && getDesktopBridge()?.browserCommand ? workspace.primaryTab.label : null;
    return createPortal(
        <WorkspaceBandTabLabel value={tabLabel}>{children}</WorkspaceBandTabLabel>,
        slot.container
    );
}

/**
 * Portals a page's actions to the desktop tab strip's end — the chat's
 * actions menu sits at the band's top-right corner. Renders nothing outside
 * the desktop strip, where pages keep their actions in their band content.
 */
export function WorkspaceBandActions({ children }: { children: React.ReactNode }) {
    const slot = React.use(TopbarContext);

    if (!slot?.actionsContainer) {
        return null;
    }

    return createPortal(children, slot.actionsContainer);
}
