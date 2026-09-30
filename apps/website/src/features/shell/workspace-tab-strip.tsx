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
import { Button, Tooltip } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { workspaceTabId } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { ArtifactWorkspaceTab } from './artifact-workspace-tab.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspaceTab } from './browser-workspace-tab.tsx';
import { PrimaryWorkspaceTab } from './primary-workspace-tab.tsx';

/**
 * Every workspace tab — the primary tab, browser tabs, and artifact tabs — in
 * one evenly spaced sortable strip, then the new-tab button. Dragging moves a
 * tab along the strip only, siblings slide aside live, and the new order
 * commits on drop; Escape cancels.
 */
export function WorkspaceTabStrip() {
    const workspace = useBrowserWorkspace();
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    if (!(workspace && getDesktopBridge()?.browserCommand)) {
        return null;
    }
    const ids = workspace.tabs.map(workspaceTabId);
    return (
        <div className="workspace-tabs">
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
                        workspace.reorderTabs(arrayMove(workspace.tabs, from, to));
                    }
                }}
                sensors={sensors}
            >
                <nav aria-label="Workspace tabs" className="workspace-tab-list">
                    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                        {workspace.tabs.map((ref) => {
                            if (ref.kind === 'primary') {
                                return <PrimaryWorkspaceTab key={workspaceTabId(ref)} />;
                            }
                            if (ref.kind === 'browser') {
                                const tab = workspace.state.tabs.find((item) => item.id === ref.id);
                                return tab ? (
                                    <BrowserWorkspaceTab key={workspaceTabId(ref)} tab={tab} />
                                ) : null;
                            }
                            const tab = workspace.artifacts.find((item) => item.key === ref.key);
                            return tab ? (
                                <ArtifactWorkspaceTab key={workspaceTabId(ref)} tab={tab} />
                            ) : null;
                        })}
                    </SortableContext>
                </nav>
            </DndContext>
            <span className="workspace-new-tab">
                <Tooltip>
                    <Button
                        aria-label="New browser tab"
                        isIconOnly
                        onPress={() => workspace.command({ kind: 'new' })}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                    </Button>
                    <Tooltip.Content>New browser tab</Tooltip.Content>
                </Tooltip>
            </span>
        </div>
    );
}

/**
 * Pins a dragged tab to the strip's axis and clamps it inside the whole tab
 * list (the dragged node's parent, primary tab included), whose overflow guard
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
