import * as React from 'react';
import type { UploadSource } from './upload-plan.ts';
import { dropUploadSources } from './upload-sources.ts';

/** The drag type a drag of library items carries (JSON paths), so drops can tell it from files. */
export const libraryDragType = 'application/x-haus-files';

/**
 * Drops onto the library's scroll area, with native drag events rather than a
 * drop-zone widget: the whole page is the target, so it earns no tab stop of
 * its own (the Upload menu and Move to… are the keyboard paths).
 *
 * - Files and folders from the system upload into the open folder anywhere on
 *   the library, which lights up (`isFileTarget`).
 * - A drag of library items moves them into the folder tile under the pointer
 *   (`moveTarget` names it, so the tile lights up) when `canMoveInto` allows
 *   it; anywhere else, and onto a folder the selection holds, it is a no-op.
 */
export function useLibraryDrop(input: {
    canMoveInto: (folder: string) => boolean;
    /** The folder tile `target` sits in, or null outside any. */
    folderAt: (target: EventTarget | null) => string | null;
    onFiles: (sources: UploadSource<File>[]) => void;
    onMove: (folder: string) => void;
}) {
    const [isFileTarget, setFileTarget] = React.useState(false);
    const [moveTarget, setMoveTarget] = React.useState<string | null>(null);
    // dragenter/dragleave fire for every child crossed; count to know when the pointer truly left.
    const depth = React.useRef(0);
    const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files');
    const carriesItems = (event: React.DragEvent) =>
        event.dataTransfer.types.includes(libraryDragType);
    const moveFolderAt = (event: React.DragEvent) => {
        const folder = input.folderAt(event.target);
        return folder !== null && input.canMoveInto(folder) ? folder : null;
    };

    const dropProps = {
        // A drag of library items starts inside the library, so its end bubbles here.
        onDragEnd: () => {
            depth.current = 0;
            setMoveTarget(null);
        },
        onDragEnter: (event: React.DragEvent) => {
            if (carriesItems(event)) {
                depth.current += 1;
                setMoveTarget(moveFolderAt(event));
                return;
            }
            if (!carriesFiles(event)) {
                return;
            }
            event.preventDefault();
            depth.current += 1;
            setFileTarget(true);
        },
        onDragLeave: (event: React.DragEvent) => {
            if (!(carriesFiles(event) || carriesItems(event))) {
                return;
            }
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) {
                setFileTarget(false);
                setMoveTarget(null);
            }
        },
        onDragOver: (event: React.DragEvent) => {
            if (carriesFiles(event)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                return;
            }
            if (!carriesItems(event)) {
                return;
            }
            const folder = moveFolderAt(event);
            setMoveTarget(folder);
            if (folder !== null) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            }
        },
        onDrop: (event: React.DragEvent) => {
            if (carriesItems(event)) {
                const folder = moveFolderAt(event);
                depth.current = 0;
                setMoveTarget(null);
                if (folder !== null) {
                    event.preventDefault();
                    input.onMove(folder);
                }
                return;
            }
            if (!carriesFiles(event)) {
                return;
            }
            event.preventDefault();
            depth.current = 0;
            setFileTarget(false);
            void dropUploadSources(event.dataTransfer).then(input.onFiles);
        },
    };

    return { dropProps, isFileTarget, moveTarget };
}
