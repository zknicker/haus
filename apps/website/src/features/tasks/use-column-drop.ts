import * as React from 'react';
import { type DropItem, isTextDropItem, useDragAndDrop } from 'react-aria-components';

type DragOptions = Parameters<typeof useDragAndDrop>[0];

const taskDragType = 'application/x-haus-task';

/**
 * One column's half of a cross-column drag, on React Aria's stock draggable
 * collection, the engine Kanban is built on. `useKanban` keeps its own
 * `ListData` copy of the items, which would be a second owner beside the
 * React Query cache, so the column reads the board's Tasks and only hands the
 * dropped id up. A Task has no position inside its column, so a drop before a
 * card and a drop on the empty list mean the same thing, and a drop back into
 * its own column means nothing.
 */
export function useColumnDrop({
    onDrop,
    renderDropIndicator,
}: {
    onDrop: (taskId: string) => void;
    renderDropIndicator: DragOptions['renderDropIndicator'];
}) {
    const latestDrop = React.useRef(onDrop);
    React.useLayoutEffect(() => {
        latestDrop.current = onDrop;
    });
    const { dragAndDropHooks } = useDragAndDrop({
        acceptedDragTypes: [taskDragType],
        getDropOperation: () => 'move',
        getItems: (keys) =>
            [...keys].map((key) => ({ [taskDragType]: String(key), 'text/plain': String(key) })),
        onInsert: (event) => dropTasks(event, latestDrop.current),
        onRootDrop: (event) => dropTasks(event, latestDrop.current),
        renderDropIndicator,
    });
    return dragAndDropHooks;
}

async function dropTasks({ items }: { items: DropItem[] }, onDrop: (taskId: string) => void) {
    const ids = await Promise.all(
        items.filter(isTextDropItem).map((item) => item.getText(taskDragType))
    );
    for (const id of ids) {
        onDrop(id);
    }
}
