import { artifactPathKey, artifactPathParent } from '@haus/api';
import type { ReactNode } from 'react';
import { ArtifactPathRow } from './artifact-path-row.tsx';
import { artifactFolderTone } from './drive-folders.ts';
import { driveFolderLabel } from './drive-places.ts';
import {
    driveAreaFilesLabel,
    droppableCrumbs,
    workspacePathCrumbs,
} from './drive-workspace-trail.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import type { LibraryTrailDrop } from './library-trail.ts';

export function ArtifactLibraryFolderRow({
    agentName,
    children,
    drag,
    folder,
    root,
    slug,
}: {
    agentName: (handle: string) => string | undefined;
    children: ReactNode;
    drag: LibraryTrailDrop;
    folder: string;
    root: string;
    slug: string;
}) {
    const atRoot = artifactPathKey(folder) === artifactPathKey(root);
    return (
        <ArtifactPathRow
            crumbs={
                atRoot
                    ? []
                    : droppableCrumbs(
                          workspacePathCrumbs(slug, root, artifactPathParent(folder)),
                          drag
                      )
            }
            current={atRoot ? driveAreaFilesLabel : driveFolderLabel(folder, agentName)}
            glyph={<ArtifactFolderIcon size={14} tone={artifactFolderTone(root)} />}
        >
            {children}
        </ArtifactPathRow>
    );
}
