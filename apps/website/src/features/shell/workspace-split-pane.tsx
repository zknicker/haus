import { ToggleButton, Tooltip } from '@heroui/react';
import { LayoutTwoColumnIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { ResizablePaneRail } from '../../components/ui/resizable-pane-rail.tsx';
import { useSplitPaneWidth } from '../../hooks/workspace-tabs/use-split-pane-width.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableTabList } from './sortable-tab-list.tsx';
import { WorkspaceTabPage } from './workspace-tab-page.tsx';

/**
 * The split (ADR 0038): a second tab group docked right of the content area,
 * with its own strip, resizable from its leading edge. It renders only once it
 * holds a tab; an open split with no tabs is just the routing state that sends
 * the next new tab here. Desktop only.
 */
export function WorkspaceSplitPane() {
    const workspace = useBrowserWorkspace();
    const width = useSplitPaneWidth();
    if (!(workspace && getDesktopBridge()?.browserCommand && workspace.split.order.length > 0)) {
        return null;
    }
    const { focusGroup, split } = workspace;
    return (
        // Pointer and focus inside the split point Command-W at its strip.
        <aside
            aria-label="Split view"
            className="workspace-split"
            onFocusCapture={() => focusGroup('split')}
            onPointerDownCapture={() => focusGroup('split')}
            ref={width.ref}
            style={{ width: width.width }}
        >
            <ResizablePaneRail
                aria-label="Resize split view"
                maxWidth={width.maxWidth}
                minWidth={width.minWidth}
                onWidthChange={width.setWidth}
                side="left"
                width={width.width}
            />
            <div className="workspace-split__strip workspace-tabs">
                <SortableTabList
                    group="split"
                    label="Split view tabs"
                    onReorder={workspace.reorderSplitTabs}
                    tabs={split.order}
                />
            </div>
            <div className="relative flex min-h-0 flex-1">
                {split.active ? (
                    <WorkspaceTabPage className="min-w-0 flex-1" tabRef={split.active} />
                ) : null}
            </div>
        </aside>
    );
}

/** The band button that opens or closes the split. */
export function WorkspaceSplitToggle() {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    // Pressed while the split is open, including an armed split with no tabs yet.
    const label = workspace.split.open ? 'Close split view' : 'Open split view';
    return (
        <Tooltip>
            <ToggleButton
                aria-label="Split view"
                isIconOnly
                isSelected={workspace.split.open}
                onChange={workspace.toggleSplit}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={LayoutTwoColumnIcon} size={16} />
            </ToggleButton>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}
