import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import { useSidePaneWidth } from '../../hooks/workspace-tabs/use-side-pane-width.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { ClosableTabPage } from './workspace-tab-page.tsx';

/**
 * Split mode's side pane (ADR 0038, after Codex): docked right of the routed
 * page on every route, resizable from its leading edge, showing the selected
 * closable tab. Its strip lives in the window band above it
 * (WorkspaceBandTrail). Desktop only; it renders while shown and holding tabs.
 */
export function WorkspaceSidePane() {
    const workspace = useBrowserWorkspace();
    const width = useSidePaneWidth();
    if (!(workspace?.sidePaneShown && getDesktopBridge()?.browserCommand)) {
        return null;
    }
    const { focusPane, shownClosable } = workspace;
    return (
        // Pointer and focus inside the pane point Command-W at its selected tab.
        <aside
            aria-label="Side pane"
            className="workspace-side-pane"
            onFocusCapture={() => focusPane('side')}
            onPointerDownCapture={() => focusPane('side')}
            ref={width.ref}
            style={{ width: width.width }}
        >
            {/* The rail sits wholly outside the pane: a browser page's native view paints
                above DOM, so any part of the rail over the page could not be grabbed. */}
            <ResizablePaneRail
                aria-label="Resize side pane"
                className="-left-2 w-2 before:left-[calc(100%-0.5px)]"
                maxWidth={width.maxWidth}
                minWidth={width.minWidth}
                onWidthChange={width.setWidth}
                side="left"
                width={width.width}
            />
            <div className="relative flex min-h-0 flex-1">
                {shownClosable ? (
                    <ClosableTabPage className="min-w-0 flex-1" tabRef={shownClosable} />
                ) : null}
            </div>
        </aside>
    );
}
