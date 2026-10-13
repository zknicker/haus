import * as React from 'react';
import type { UploadSource } from './upload-plan.ts';
import { dropUploadSources } from './upload-sources.ts';

/**
 * Drop files or folders anywhere on the library. Native drag events rather
 * than a drop-zone widget: the whole page is the target, so it earns no tab
 * stop of its own (the Upload menu is the keyboard path). Only drags that
 * carry files light the page up.
 */
export function useLibraryFileDrop(onSources: (sources: UploadSource<File>[]) => void) {
    const [isDropTarget, setDropTarget] = React.useState(false);
    // dragenter/dragleave fire for every child crossed; count to know when the pointer truly left.
    const depth = React.useRef(0);
    const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files');

    const dropProps = {
        onDragEnter: (event: React.DragEvent) => {
            if (!carriesFiles(event)) {
                return;
            }
            event.preventDefault();
            depth.current += 1;
            setDropTarget(true);
        },
        onDragLeave: (event: React.DragEvent) => {
            if (!carriesFiles(event)) {
                return;
            }
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) {
                setDropTarget(false);
            }
        },
        onDragOver: (event: React.DragEvent) => {
            if (carriesFiles(event)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
            }
        },
        onDrop: (event: React.DragEvent) => {
            if (!carriesFiles(event)) {
                return;
            }
            event.preventDefault();
            depth.current = 0;
            setDropTarget(false);
            void dropUploadSources(event.dataTransfer).then(onSources);
        },
    };

    return { dropProps, isDropTarget };
}
