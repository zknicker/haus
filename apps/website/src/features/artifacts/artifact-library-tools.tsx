import { ArtifactLibraryControls } from './artifact-library-controls.tsx';
import { ArtifactSelectionBar } from './artifact-selection-bar.tsx';
import { ArtifactUploadMenu } from './artifact-upload-menu.tsx';
import { selectionSummary } from './library-bulk.ts';
import type { LibraryItem } from './library-items.ts';
import type { useArtifactLibraryParams } from './library-params.ts';
import type { ArtifactActions } from './use-artifact-actions.tsx';
import type { DriveUpload } from './use-drive-upload.tsx';
import type { useSelectionActions } from './use-selection-actions.tsx';

export function ArtifactLibraryTools({
    acceptsFiles,
    actions,
    empty,
    folderName,
    params,
    picked,
    placement,
    search,
    serverId,
    upload,
}: {
    acceptsFiles: boolean;
    actions: Pick<ArtifactActions, 'runFolder'>;
    empty: boolean;
    folderName: string;
    params: ReturnType<typeof useArtifactLibraryParams>;
    picked: {
        bulk: ReturnType<typeof useSelectionActions>['selection'];
        items: LibraryItem[];
        onClear: () => void;
        partial: boolean;
    };
    placement: 'band' | 'row';
    search: { onChange: (value: string) => void; value: string };
    serverId: string;
    upload: DriveUpload;
}) {
    if (picked.items.length > 1) {
        const summary = selectionSummary(picked.items);
        return (
            <ArtifactSelectionBar
                actions={picked.bulk.actions(picked.items)}
                onClear={picked.onClear}
                onRun={(id) => picked.bulk.run(id, picked.items)}
                summary={picked.partial ? `${summary} · loaded files only` : summary}
            />
        );
    }
    return (
        <ArtifactLibraryControls
            creator={params.creator}
            fileFilters={acceptsFiles || params.kind !== 'all' || params.creator !== null}
            kind={params.kind}
            onClearFilters={params.clearFilters}
            onCreatorChange={params.selectCreator}
            onKindChange={params.selectKind}
            placement={placement}
            search={
                placement === 'row'
                    ? null
                    : {
                          ...search,
                          label: params.folder ? `Search in ${folderName}` : 'Search files',
                      }
            }
            serverId={serverId}
            showView={!empty}
            uploadMenu={
                acceptsFiles && !empty ? (
                    <ArtifactUploadMenu
                        isPending={upload.isPending}
                        onRecentlyDeleted={() =>
                            actions.runFolder('recently-deleted', params.folder)
                        }
                        onUploadFiles={upload.openFiles}
                        onUploadFolder={upload.openFolder}
                    />
                ) : null
            }
        />
    );
}
