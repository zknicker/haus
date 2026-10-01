import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    type Modifier,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    horizontalListSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type * as React from 'react';
import {
    type ClosableTabRef,
    workspaceTabId,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { WorkspaceTabItem } from './workspace-tab-item.tsx';
import { WorkspaceTabMenu } from './workspace-tab-menu.tsx';

/**
 * An evenly spaced sortable tab list. Dragging moves a tab along the strip
 * only, siblings slide aside live, and the new order commits on drop; Escape
 * cancels. A `leading` tab (the primary tab) sits first and does not sort.
 */
export function SortableTabList({
    label,
    leading,
    onReorder,
    tabs,
}: {
    label: string;
    leading?: React.ReactNode;
    onReorder: (tabs: ClosableTabRef[]) => void;
    tabs: ClosableTabRef[];
}) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    const ids = tabs.map(workspaceTabId);
    return (
        <DndContext
            collisionDetection={closestCenter}
            modifiers={stripModifiers}
            onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) {
                    return;
                }
                const from = ids.indexOf(String(active.id));
                const to = ids.indexOf(String(over.id));
                if (from >= 0 && to >= 0) {
                    onReorder(arrayMove(tabs, from, to));
                }
            }}
            sensors={sensors}
        >
            <WorkspaceTabMenu>
                <nav aria-label={label} className="workspace-tab-list">
                    {leading}
                    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                        {tabs.map((ref) => (
                            <WorkspaceTabItem key={workspaceTabId(ref)} tabRef={ref} />
                        ))}
                    </SortableContext>
                </nav>
            </WorkspaceTabMenu>
        </DndContext>
    );
}

/**
 * Pins a dragged tab to the strip's axis and clamps it inside the whole tab
 * list (the dragged node's parent, a leading tab included), whose overflow guard
 * would otherwise clip it.
 */
const restrictToTabStrip: Modifier = ({ containerNodeRect, draggingNodeRect, transform }) => {
    if (!(containerNodeRect && draggingNodeRect)) {
        return { ...transform, y: 0 };
    }
    const min = containerNodeRect.left - draggingNodeRect.left;
    const max = containerNodeRect.right - draggingNodeRect.right;
    return { ...transform, x: Math.min(Math.max(transform.x, min), max), y: 0 };
};

const stripModifiers = [restrictToTabStrip];
