import * as React from 'react';
import type { PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { useDraggedRow } from './tab-drag/tab-rows-drag.tsx';
import { WorkspaceTabMenu } from './workspace-tab-menu.tsx';
import { PaneTab } from './workspace-tab-pane-item.tsx';

/**
 * One row's evenly spaced tabs, in the order the window's tab drag projects
 * (`tab-drag/`): dragged tabs sit at their slot and their neighbors slide aside.
 */
export function SortableTabList({ label, pane }: { label: string; pane: PaneSide }) {
    const list = React.useRef<HTMLElement | null>(null);
    const { draggingIds, tabIds } = useDraggedRow(list, pane);
    return (
        <WorkspaceTabMenu>
            <nav aria-label={label} className="workspace-tab-list" ref={list}>
                {tabIds.map((tabId) => (
                    <PaneTab dragging={draggingIds.includes(tabId)} key={tabId} tabId={tabId} />
                ))}
            </nav>
        </WorkspaceTabMenu>
    );
}
