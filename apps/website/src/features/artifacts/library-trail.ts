import type { BandCrumb } from '../shell/band-trail.ts';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { type ArtifactLibraryView, libraryHref } from './library-params.ts';
import { libraryDragType } from './use-library-drop.ts';

/** What the trail needs from a drag of library items: whether it may land, and the landing. */
export interface LibraryTrailDrop {
    canMoveInto: (folder: string) => boolean;
    moveInto: (folder: string) => void;
}

/**
 * Files, then each folder above the open one; the open folder is the trail's
 * unlinked end. Every linked crumb is also a drop target: dragging library
 * items onto it moves them into that folder.
 */
export function libraryTrail(
    slug: string,
    view: ArtifactLibraryView,
    drag: LibraryTrailDrop
): BandCrumb[] {
    const crumbs = artifactFolderCrumbs(view.folder);
    if (crumbs.length === 0) {
        return [];
    }
    const crumb = (folder: string, label: string): BandCrumb => ({
        drop: {
            accepts: (types) => types.includes(libraryDragType) && drag.canMoveInto(folder),
            onDrop: () => drag.moveInto(folder),
        },
        href: libraryHref(slug, { ...view, folder }),
        label,
    });
    return [
        crumb('', 'Files'),
        ...crumbs.slice(0, -1).map((entry) => crumb(entry.path, entry.label)),
    ];
}
