import * as React from 'react';

/**
 * Marks an element whose whole area attaches dropped files to the composer
 * inside it. Surfaces nest (a Thread pane inside a chat), so a drop belongs
 * to the nearest marked ancestor of its target and nothing else.
 */
export const composerDropSurfaceProps = { 'data-composer-drop-surface': '' } as const;

const dropSurfaceSelector = '[data-composer-drop-surface]';

/**
 * Attaches files dropped anywhere on the composer's own drop surface. The
 * surface is found from the composer's DOM position, never by a document
 * query, so split panes each keep their drops.
 */
export function useComposerFileDrop({
    disabled,
    onFiles,
}: {
    disabled: boolean;
    onFiles: (files: File[]) => void;
}) {
    const attachFiles = React.useEffectEvent(onFiles);
    const [surface, setSurface] = React.useState<HTMLElement | null>(null);
    const [isFileDropActive, setIsFileDropActive] = React.useState(false);
    const anchorRef = React.useCallback((node: HTMLElement | null) => {
        setSurface(node?.closest<HTMLElement>(dropSurfaceSelector) ?? null);
    }, []);

    React.useEffect(() => {
        if (disabled || !surface) {
            return;
        }
        // Enter/leave pairs balance as the pointer crosses child elements
        // (the next enter fires before the previous leave), so the count only
        // reaches zero when the drag really leaves the surface or is cancelled.
        let depth = 0;
        const reset = () => {
            depth = 0;
            setIsFileDropActive(false);
        };
        const handleDragOver = (event: DragEvent) => {
            if (!hasFileTransfer(event.dataTransfer)) {
                return;
            }
            if (event.type === 'dragenter') {
                depth += 1;
            }
            if (!ownsDropTarget(event.target, surface)) {
                setIsFileDropActive(false);
                return;
            }
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
            }
            setIsFileDropActive(true);
        };
        const handleDragLeave = (event: DragEvent) => {
            if (!hasFileTransfer(event.dataTransfer)) {
                return;
            }
            depth = Math.max(0, depth - 1);
            const next = event.relatedTarget;
            if (depth === 0 || (next instanceof Node && !surface.contains(next))) {
                reset();
            }
        };
        const handleDrop = (event: DragEvent) => {
            if (!(hasFileTransfer(event.dataTransfer) && ownsDropTarget(event.target, surface))) {
                return;
            }
            event.preventDefault();
            reset();
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length > 0) {
                attachFiles(files);
            }
        };
        // A drag over anything outside the surface (another pane, the
        // sidebar) clears it even if an unmounted child skipped its leave.
        const handleWindowDragOver = (event: DragEvent) => {
            if (!(event.target instanceof Node && surface.contains(event.target))) {
                reset();
            }
        };

        surface.addEventListener('dragenter', handleDragOver);
        surface.addEventListener('dragover', handleDragOver);
        surface.addEventListener('dragleave', handleDragLeave);
        surface.addEventListener('drop', handleDrop);
        window.addEventListener('dragover', handleWindowDragOver);
        window.addEventListener('dragend', reset);
        window.addEventListener('drop', reset);
        return () => {
            surface.removeEventListener('dragenter', handleDragOver);
            surface.removeEventListener('dragover', handleDragOver);
            surface.removeEventListener('dragleave', handleDragLeave);
            surface.removeEventListener('drop', handleDrop);
            window.removeEventListener('dragover', handleWindowDragOver);
            window.removeEventListener('dragend', reset);
            window.removeEventListener('drop', reset);
            reset();
        };
    }, [disabled, surface]);

    return { anchorRef, isFileDropActive, surface };
}

/**
 * Keeps a file drop that misses every drop surface from navigating the
 * window to the file. Surface handlers run first and claim their drops.
 */
export function installStrayFileDropGuard(target: Pick<Window, 'addEventListener'>) {
    const guard = (event: DragEvent) => {
        if (event.defaultPrevented || !hasFileTransfer(event.dataTransfer)) {
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'none';
        }
    };
    target.addEventListener('dragover', guard);
    target.addEventListener('drop', guard);
}

export function hasFileTransfer(dataTransfer: Pick<DataTransfer, 'types'> | null) {
    return dataTransfer ? Array.from(dataTransfer.types).includes('Files') : false;
}

export function ownsDropTarget(target: EventTarget | null, surface: Element) {
    const element = target as Pick<Element, 'closest'> | null;
    return typeof element?.closest === 'function'
        ? element.closest(dropSurfaceSelector) === surface
        : false;
}
