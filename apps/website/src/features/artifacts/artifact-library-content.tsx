import type { ArtifactListSummary, ArtifactMetadata, ArtifactRecord } from '@haus/api';
import { Button } from '@heroui/react';
import type { DragAndDropHooks } from 'react-aria-components';
import { useArtifactFolderPreviews } from '../../hooks/artifacts/use-artifact-folder-previews.ts';
import type {
    ArtifactLibrary,
    ArtifactLibraryFilters,
} from '../../hooks/artifacts/use-artifact-library.ts';
import { useArtifactFileRuns } from './artifact-files.tsx';
import { formatArtifactBytes } from './artifact-format.ts';
import { ArtifactLibraryCollection } from './artifact-library-collection.tsx';
import { ArtifactLibraryEmpty } from './artifact-library-empty.tsx';
import { ArtifactListHeader } from './artifact-list-header.tsx';
import type { DriveFolder } from './drive-places.ts';
import { useArtifactLibraryLayout } from './library-layout.ts';
import type { LibrarySelection } from './library-selection.ts';

/**
 * The column under the band: blank until the first read lands, the empty
 * state only for a real zero, otherwise the library's one collection (the
 * open folder's child folders, or a search's matching folders, then files)
 * with Show more under it, and a footer with how much the folder holds.
 */
export function ArtifactLibraryContent({
    dragAndDropHooks,
    dropTarget,
    filtered,
    filters,
    folderName,
    folders,
    library,
    onOpenFile,
    onOpenFolder,
    onShowFolder,
    onUpload,
    selection,
    serverId,
}: {
    dragAndDropHooks: DragAndDropHooks<object>;
    dropTarget: string | null;
    filtered: boolean;
    filters: Pick<ArtifactLibraryFilters, 'creator' | 'folder' | 'kind'>;
    /** The open folder's child folders in the viewer's sort. */
    /** The open folder's label, which names its instructions. */
    folderName: string;
    folders: readonly DriveFolder[];
    library: ArtifactLibrary;
    onOpenFile: (artifact: ArtifactMetadata) => void;
    onOpenFolder: (path: string) => void;
    onShowFolder: (artifact: ArtifactRecord) => { href: string; onOpen: () => void };
    onUpload: () => void;
    selection: LibrarySelection;
    serverId: string;
}) {
    const layout = useArtifactLibraryLayout();
    const previews = useArtifactFolderPreviews(serverId, filters, folders);
    const artifacts = library.artifacts;
    const runs = useArtifactFileRuns({
        artifacts: artifacts ?? [],
        folder: filters.folder,
        onShowFolder,
        publicLinks: library.publicLinks,
        serverId,
    });

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
                folderName={folderName}
                onOpenFile={onOpenFile}
                onOpenFolder={onOpenFolder}
                onUpload={onUpload}
                serverId={serverId}
            />
        );
    }
    return (
        <section aria-label="Library" className="flex flex-col gap-3">
            {layout === 'list' ? <ArtifactListHeader /> : null}
            <ArtifactLibraryCollection
                dragAndDropHooks={dragAndDropHooks}
                dropTarget={dropTarget}
                folder={filters.folder}
                folders={folders}
                layout={layout}
                onOpenFile={onOpenFile}
                onOpenFolder={onOpenFolder}
                previews={previews}
                runs={runs}
                selection={selection}
                serverId={serverId}
            />
            {library.hasMore ? (
                <Button
                    className="self-center"
                    isPending={library.isFetchingMore}
                    onPress={library.loadMore}
                    size="sm"
                    variant="ghost"
                >
                    Show more
                </Button>
            ) : null}
            {library.summary && library.summary.files + library.summary.files_in_folders > 0 ? (
                <p className="artifact-library-footer">{folderTotalLabel(library.summary)}</p>
            ) : null}
        </section>
    );
}

function folderTotalLabel(summary: ArtifactListSummary) {
    const files = summary.files + summary.files_in_folders;
    const count = files === 1 ? '1 file' : `${files.toLocaleString()} files`;
    return `${count} · ${formatArtifactBytes(summary.size_bytes)}`;
}
