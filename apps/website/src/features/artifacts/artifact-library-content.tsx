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

/**
 * The column under the band: blank until the first read lands, the empty
 * state only for a real zero, otherwise child folders (never while
 * searching, which reads the whole subtree) and then files, sharing the
 * library's one Finder-style selection.
 */
export function ArtifactLibraryContent({
    filtered,
    filters,
    library,
    onOpenFolder,
    onUpload,
    searching,
    selection,
    serverId,
}: {
    filtered: boolean;
    filters: Omit<ArtifactLibraryFilters, 'query'>;
    library: ArtifactLibrary;
    onOpenFolder: (path: string) => void;
    onUpload: () => void;
    searching: boolean;
    selection: LibrarySelection;
    serverId: string;
}) {
    const layout = useArtifactLibraryLayout();
    const folders = searching ? [] : library.folders;
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
                atRoot={filters.folder === ''}
                filtered={filtered}
                onUpload={onUpload}
            />
        );
    }
    return (
        <>
            {folders.length > 0 ? (
                <ArtifactFolderRow
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
                    selection={selection}
                    serverId={serverId}
                />
            ) : null}
        </>
    );
}
