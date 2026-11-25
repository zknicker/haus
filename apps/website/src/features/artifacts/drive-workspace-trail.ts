import { artifactPathKey } from '@haus/api';
import type { BandCrumb, BandCrumbDrop } from '../shell/band-trail.ts';
import type { ArtifactPathCrumb } from './artifact-path-row.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { driveFolderLabel, driveRootLabel } from './drive-places.ts';
import { libraryHref } from './library-params.ts';
import type { LibraryTrailDrop } from './library-trail.ts';
import { libraryDragType } from './use-library-drop.ts';

type AgentName = (handle: string) => string | undefined;

const plain = { creator: null, folder: '', kind: 'all' } as const;

export const driveAreaFilesLabel = 'All files';

export function workspaceBandTrail(slug: string, root: string, agentName: AgentName) {
    const above = artifactFolderCrumbs(root).slice(0, -1);
    const crumbs: BandCrumb[] =
        root === ''
            ? []
            : [
                  { href: libraryHref(slug, plain), label: driveRootLabel },
                  ...above.map((crumb) => ({
                      href: libraryHref(slug, { ...plain, folder: crumb.path }),
                      label: driveFolderLabel(crumb.path, agentName),
                  })),
              ];
    return { crumbs, current: driveFolderLabel(root, agentName) };
}

export function workspacePathCrumbs(slug: string, root: string, folder: string) {
    const rootKey = artifactPathKey(root);
    const below = artifactFolderCrumbs(folder).filter(
        (crumb) => artifactPathKey(crumb.path).length > rootKey.length
    );
    const crumbs: ArtifactPathCrumb[] = [
        {
            href: libraryHref(slug, { ...plain, folder: root }),
            label: driveAreaFilesLabel,
            path: root,
        },
        ...below.map((crumb) => ({
            href: libraryHref(slug, { ...plain, folder: crumb.path }),
            label: crumb.label,
            path: crumb.path,
        })),
    ];
    return crumbs;
}

export function droppableCrumbs(crumbs: readonly ArtifactPathCrumb[], drag: LibraryTrailDrop) {
    return crumbs.map((crumb) => {
        const drop: BandCrumbDrop = {
            accepts: (types) => types.includes(libraryDragType) && drag.canMoveInto(crumb.path),
            onDrop: () => drag.moveInto(crumb.path),
        };
        return { ...crumb, drop };
    });
}
