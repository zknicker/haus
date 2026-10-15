import type { ArtifactRecord } from '@haus/api';
import * as React from 'react';
import { useArtifactFolderPreviews } from '../../hooks/artifacts/use-artifact-folder-previews.ts';
import type {
    ArtifactLibrary,
    ArtifactLibraryFilters,
} from '../../hooks/artifacts/use-artifact-library.ts';
import { ArtifactFiles } from './artifact-files.tsx';
import { ArtifactFolderRow } from './artifact-folder-row.tsx';
import { ArtifactLibraryEmpty } from './artifact-library-empty.tsx';
import { useArtifactLibraryLayout } from './library-layout.ts';
import type { LibrarySelection } from './library-selection.ts';
import { sortLibraryFolders, useArtifactLibrarySort } from './library-sort.ts';

/**
 * The column under the band: blank until the first read lands, the empty
 * state only for a real zero, otherwise folders (the open folder's children,
 * or a search's matching folders) and then files, sharing the library's one
 * Finder-style selection.
 */
export function ArtifactLibraryContent({
    filtered,
    filters,
    library,
    onOpenFolder,
    onShowFolder,
    onUpload,
    selection,
    serverId,
}: {
    filtered: boolean;
    filters: Pick<ArtifactLibraryFilters, 'creator' | 'folder' | 'kind'>;
    library: ArtifactLibrary;
    onOpenFolder: (path: string) => void;
    onShowFolder: (artifact: ArtifactRecord) => { href: string; onOpen: () => void };
    onUpload: () => void;
    selection: LibrarySelection;
    serverId: string;
}) {
    const layout = useArtifactLibraryLayout();
    const sort = useArtifactLibrarySort();
    const folders = React.useMemo(
        () => sortLibraryFolders(library.folders, sort),
        [library.folders, sort]
    );
    const previews = useArtifactFolderPreviews(serverId, filters, folders);
    const artifacts = library.artifacts;

    if (library.error) {
        return <p role="alert">{library.error.message}</p>;
    }
    if (!artifacts) {
        return <section aria-busy="true" aria-label="Loading files" className="min-h-32" />;
    }
    if (folders.length === 0 && artifacts.length === 0) {
        return (
            <ArtifactLibraryEmpty
                filtered={filtered}
                folder={filters.folder}
                onOpenFolder={onOpenFolder}
                onUpload={onUpload}
            />
        );
    }
    return (
        <>
            {folders.length > 0 ? (
                <ArtifactFolderRow
                    folder={filters.folder}
                    folders={folders}
                    onOpen={onOpenFolder}
                    previews={previews}
                    selection={selection}
                    serverId={serverId}
                />
            ) : null}
            {artifacts.length > 0 ? (
                <ArtifactFiles
                    artifacts={artifacts}
                    folder={filters.folder}
                    layout={layout}
                    library={library}
                    onShowFolder={onShowFolder}
                    selection={selection}
                    serverId={serverId}
                />
            ) : null}
        </>
    );
}
