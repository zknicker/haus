import {
    closestCenter,
    DndContext,
    KeyboardSensor,
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
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspaceTab } from './browser-workspace-tab.tsx';

export function BrowserWorkspaceTabs() {
    const workspace = useBrowserWorkspace();
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    if (!(workspace && getDesktopBridge()?.browserCommand)) {
        return null;
    }
    const ids = workspace.state.tabs.map((tab) => tab.id);
    return (
        <div className="flex min-w-0 items-center gap-1">
            <DndContext
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                    if (!over || active.id === over.id) {
                        return;
                    }
                    const from = ids.indexOf(String(active.id));
                    const to = ids.indexOf(String(over.id));
                    if (from >= 0 && to >= 0) {
                        workspace.command({ kind: 'reorder', ids: arrayMove(ids, from, to) });
                    }
                }}
                sensors={sensors}
            >
                <nav
                    aria-label="Browser tabs"
                    className="flex min-w-0 items-center gap-1 overflow-x-auto"
                >
                    <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
                        {workspace.state.tabs.map((tab) => (
                            <BrowserWorkspaceTab key={tab.id} tab={tab} />
                        ))}
                    </SortableContext>
                </nav>
            </DndContext>
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
        </div>
    );
}
