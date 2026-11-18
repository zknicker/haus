import { Chip } from '@heroui/react';
import * as React from 'react';
import { useDragAndDrop } from 'react-aria-components';
import { bulkMovePaths } from './library-bulk.ts';
import type { LibraryItem } from './library-items.ts';
import { libraryDragType } from './use-library-drop.ts';

/**
 * Library items drag with React Aria's stock draggable collection: dragging
 * a selected item carries the whole selection, dragging any other item
 * carries just it. The drag names its paths (`libraryDragType`, plus plain
 * text), and the library remembers what is in flight so a folder tile or a
 * trail crumb can tell, while the pointer is still moving, whether the items
 * may land there: never into themselves, never where they already are.
 */
export function useLibraryDrag(input: {
    items: readonly LibraryItem[];
    onMove: (items: readonly LibraryItem[], folder: string) => void;
}) {
    const dragged = React.useRef<LibraryItem[] | null>(null);
    const picked = (keys: Set<React.Key>) => input.items.filter((item) => keys.has(item.key));
    const { dragAndDropHooks } = useDragAndDrop({
        getItems: (keys) => {
            const paths = picked(keys).map((item) => item.path);
            return [{ [libraryDragType]: JSON.stringify(paths), 'text/plain': paths.join('\n') }];
        },
        onDragEnd: () => {
            dragged.current = null;
        },
        onDragStart: (event) => {
            dragged.current = picked(event.keys);
        },
        // The preview renders before onDragStart, so it counts the paths the drag carries.
        renderDragPreview: (items) => {
            const paths: unknown = JSON.parse(items[0]?.[libraryDragType] ?? '[]');
            const count = Array.isArray(paths) ? paths.length : 1;
            return <Chip>{count === 1 ? '1 item' : `${count} items`}</Chip>;
        },
    });
    return {
        canMoveInto: (folder: string) =>
            dragged.current !== null &&
            bulkMovePaths(
                dragged.current.map((item) => item.path),
                folder
            ) !== null,
        dragAndDropHooks,
        moveInto: (folder: string) => {
            if (dragged.current) {
                input.onMove(dragged.current, folder);
            }
        },
    };
}
