import * as React from 'react';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import {
    framePlacement,
    layerTabIds,
    placeTabs,
    type TabFramePlacement,
    viewableTabIds,
} from './desktop-tab-placement.ts';
import { useTabDragView } from './tab-drag/tab-drag-view.ts';

/** Renders one tab's frame at its placement; pass a memoized frame so placement-only props bail out. */
export type RenderTabFrame = (tabId: string, placement: TabFramePlacement) => React.ReactNode;

/**
 * Every mounted tab frame of the window, in one stable layer over the panes
 * (ADR 0039). Frames are keyed by tab id in id order, so a frame's React tree
 * and DOM never move: a tab that changes pane only changes the rect it is
 * drawn over. During a tab drag the placement previews the drop
 * (`placeTabs`), so content follows the tab the moment it lands in another
 * row, and the drop commits the same placement.
 *
 * Memoized: the panes re-render on every divider frame; this layer, and the
 * memoized frames under it, re-render only when tabs or the drag slot change.
 */
export const DesktopTabLayer = React.memo(function DesktopTabLayer({
    renderTab,
}: {
    renderTab: RenderTabFrame;
}) {
    const tabs = useDesktopTabs();
    const drag = useTabDragView();
    const placement = React.useMemo(() => placeTabs(tabs.state, drag), [tabs.state, drag]);
    const viewable = React.useMemo(
        () => viewableTabIds(tabs.shownTabIds, drag),
        [tabs.shownTabIds, drag]
    );
    const tabIds = React.useMemo(
        () => layerTabIds(tabs.mountedTabIds, placement),
        [tabs.mountedTabIds, placement]
    );
    return (
        <div className="desktop-tab-layer">
            {tabIds.map((tabId) => (
                <React.Fragment key={tabId}>
                    {renderTab(tabId, framePlacement(tabId, placement, viewable))}
                </React.Fragment>
            ))}
        </div>
    );
});

/** Pressing or focusing inside a pane (or a frame drawn over it) focuses that pane. */
export function usePaneFocus(pane: PaneSide) {
    const { focusPane, state } = useDesktopTabs();
    const focused = state.focusedPane === pane;
    return React.useCallback(() => {
        if (!focused) {
            focusPane(pane);
        }
    }, [focusPane, focused, pane]);
}
