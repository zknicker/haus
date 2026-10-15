import type { ArtifactFolderEntry, ArtifactMetadata, ArtifactRecord } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import type { ReactNode } from 'react';
import { type DragAndDropHooks, GridList, type Key } from 'react-aria-components';
import { type ArtifactFileRun, ArtifactFileSection } from './artifact-files.tsx';
import { ArtifactFolderSection } from './artifact-folder-section.tsx';
import type { ArtifactLibraryLayout } from './library-layout.ts';
import { type LibrarySelection, librarySelectionProps } from './library-selection.ts';

/**
 * The library as one React Aria collection: the folder tiles, then each run
 * of files, as sections of a single grid. One collection means one stock
 * multiple selection in visual order, so Shift-click and Shift+Arrow ranges
 * run across folders and date groups, Command-A takes everything loaded, and
 * dragging a selected item drags the whole selection. Rows are a secondary
 * ListView in the list layout and Card tiles in the grid.
 */
export function ArtifactLibraryCollection({
    dragAndDropHooks,
    dropTarget,
    folder,
    folders,
    layout,
    onOpenFile,
    onOpenFolder,
    previews,
    runs,
    selection,
    serverId,
}: {
    dragAndDropHooks: DragAndDropHooks<object>;
    /** The folder tile a drag of library items is over. */
    dropTarget: string | null;
    folder: string;
    folders: readonly ArtifactFolderEntry[];
    layout: ArtifactLibraryLayout;
    onOpenFile: (artifact: ArtifactMetadata) => void;
    onOpenFolder: (path: string) => void;
    previews: ReadonlyMap<string, ArtifactMetadata[]>;
    runs: readonly ArtifactFileRun[];
    selection: LibrarySelection;
    serverId: string;
}) {
    const files = new Map<Key, ArtifactRecord>(
        runs.flatMap((run) => run.rows.map((row) => [row.artifact.artifact_id, row.artifact]))
    );
    const shared = {
        'aria-label': 'Files',
        dragAndDropHooks,
        onAction: (key: Key) => {
            const file = files.get(key);
            if (file) {
                onOpenFile(file);
            } else {
                onOpenFolder(String(key));
            }
        },
        ...librarySelectionProps(selection),
    };
    const sections: ReactNode = (
        <>
            {folders.length > 0 ? (
                <ArtifactFolderSection
                    dropTarget={dropTarget}
                    folder={folder}
                    folders={folders}
                    onOpen={onOpenFolder}
                    previews={previews}
                    serverId={serverId}
                />
            ) : null}
            {runs.map((run) => (
                <ArtifactFileSection
                    key={run.key}
                    layout={layout}
                    onOpen={onOpenFile}
                    run={run}
                    serverId={serverId}
                />
            ))}
        </>
    );
    return layout === 'grid' ? (
        <GridList {...shared} className="artifact-library-grid" layout="grid">
            {sections}
        </GridList>
    ) : (
        <ListView {...shared} className="artifact-file-list" variant="secondary">
            {sections}
        </ListView>
    );
}
