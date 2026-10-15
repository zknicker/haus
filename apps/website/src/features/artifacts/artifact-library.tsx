import {
    type ArtifactRecord,
    artifactBatchMaxItems,
    artifactPathBasename,
    artifactPathParent,
} from '@haus/api';
import * as React from 'react';
import type { Selection } from 'react-aria-components';
import { useNavigate } from 'react-router-dom';
import { useArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useArtifactUpload } from '../../hooks/artifacts/use-artifact-upload.ts';
import { PageBand } from '../shell/page-band.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { ArtifactLibraryContent } from './artifact-library-content.tsx';
import { ArtifactLibraryContextMenu } from './artifact-library-context-menu.tsx';
import { ArtifactLibraryControls } from './artifact-library-controls.tsx';
import { ArtifactSelectionBar } from './artifact-selection-bar.tsx';
import { ArtifactUploadConfirm, ArtifactUploadStatus } from './artifact-upload-feedback.tsx';
import { ArtifactUploadMenu } from './artifact-upload-menu.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { selectionSummary } from './library-bulk.ts';
import { rememberLibraryItem } from './library-focus.ts';
import { libraryItems, selectedLibraryItems } from './library-items.ts';
import {
    type ArtifactViewerContext,
    artifactViewerHref,
    libraryHref,
    useArtifactLibraryParams,
} from './library-params.ts';
import { librarySortOrder, sortLibraryFolders, useArtifactLibrarySort } from './library-sort.ts';
import { libraryTrail } from './library-trail.ts';
import { useArtifactActions } from './use-artifact-actions.tsx';
import { useLibraryDrag } from './use-library-drag.tsx';
import { useLibraryDrop } from './use-library-drop.ts';
import { useLibrarySelection } from './use-library-selection.ts';
import { useSelectionActions } from './use-selection-actions.tsx';
import { useUploadPickers } from './use-upload-pickers.tsx';

/**
 * The Server's shared drive as a Finder-style library: the open folder's
 * child folders, then its own files in the viewer's sort, as one selectable
 * collection. The band carries the drive trail and every control; while
 * several items are selected the controls give way to the selection's
 * actions. Folder, kind, and creator ride the URL; search and the selection
 * stay local to the folder. Files dropped anywhere, or picked from Upload,
 * land in the open folder; library items dragged onto a folder tile or a
 * trail crumb move there. One action owner feeds every menu.
 */
export function ArtifactLibrary({ serverId, slug }: { serverId: string; slug: string }) {
    const params = useArtifactLibraryParams();
    const navigate = useNavigate();
    // Search belongs to the folder it was typed in: opening another clears it.
    const [typed, setTyped] = React.useState({ folder: params.folder, text: '' });
    const search = typed.folder === params.folder ? typed.text : '';
    const setSearch = (text: string) => setTyped({ folder: params.folder, text });
    const query = React.useDeferredValue(search);
    const sort = useArtifactLibrarySort();
    const filters = { creator: params.creator, folder: params.folder, kind: params.kind };
    const library = useArtifactLibrary(serverId, {
        ...filters,
        query,
        sort: librarySortOrder(sort),
    });
    const folders = React.useMemo(
        () => sortLibraryFolders(library.folders, sort),
        [library.folders, sort]
    );
    const items = React.useMemo(
        () => libraryItems(folders, library.artifacts ?? [], library.publicLinks),
        [folders, library.artifacts, library.publicLinks]
    );
    const upload = useArtifactUpload(serverId);
    const startUpload = (sources: Parameters<typeof upload.start>[0]) =>
        void upload.start(sources, params.folder);
    const pickers = useUploadPickers(startUpload);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const picked = useLibrarySelection(params.folder, scrollRef, library.artifacts);
    const selection = {
        ...picked,
        // Command-A selects every loaded item and loads the rest, up to one batch.
        onChange: (keys: Selection) => {
            if (keys === 'all' && library.hasMore) {
                void library.loadAll(artifactBatchMaxItems);
            }
            picked.onChange(keys);
        },
    };
    const selected = selectedLibraryItems(selection.keys, items);
    const context: ArtifactViewerContext = { ...filters, query };
    const openFile = (file: { artifact_id: string }) => {
        rememberLibraryItem(params.folder, file.artifact_id);
        navigate(artifactViewerHref(slug, file.artifact_id, context));
    };
    const { actions, dialogs } = useArtifactActions({
        fileHref: (file) => artifactViewerHref(slug, file.artifact_id, context),
        folder: query.trim() ? undefined : params.folder,
        onOpenFile: openFile,
        onOpenFolder: params.openFolder,
        onShowInFolder: (folder, key) => {
            rememberLibraryItem(folder, key);
            picked.pick(folder, key);
            params.openFolder(folder);
        },
        serverId,
        slug,
        surface: 'library',
    });
    const bulk = useSelectionActions({
        folder: params.folder,
        onDeleted: selection.clear,
        serverId,
        slug,
    });
    const drag = useLibraryDrag({ items, onMove: bulk.selection.moveInto });
    const drop = useLibraryDrop({
        canMoveInto: drag.canMoveInto,
        folderAt: (target) => {
            const key =
                target instanceof Element
                    ? target.closest('[data-key]')?.getAttribute('data-key')
                    : null;
            const item = items.find((entry) => entry.key === key);
            return item?.kind === 'folder' ? item.path : null;
        },
        onFiles: startUpload,
        onMove: drag.moveInto,
    });
    const crumbs = artifactFolderCrumbs(params.folder);
    const summary =
        selection.keys === 'all' && library.hasMore
            ? `${selectionSummary(selected)} · loaded files only`
            : selectionSummary(selected);

    return (
        <ArtifactActionsContext value={actions}>
            <PageBand>
                <PageBand.Trail
                    crumbs={libraryTrail(slug, filters, drag)}
                    current={crumbs.at(-1)?.label ?? 'Files'}
                />
                <PageBand.Controls>
                    {selected.length > 1 ? (
                        <ArtifactSelectionBar
                            actions={bulk.selection.actions(selected)}
                            onClear={selection.clear}
                            onRun={(id) => bulk.selection.run(id, selected)}
                            summary={summary}
                        />
                    ) : (
                        <ArtifactLibraryControls
                            creator={params.creator}
                            folderName={params.folder ? artifactPathBasename(params.folder) : null}
                            kind={params.kind}
                            onCreatorChange={params.selectCreator}
                            onKindChange={params.selectKind}
                            onSearchChange={setSearch}
                            search={search}
                            serverId={serverId}
                            uploadMenu={
                                <ArtifactUploadMenu
                                    isPending={upload.state.phase === 'planning'}
                                    onUploadFiles={pickers.openFiles}
                                    onUploadFolder={pickers.openFolder}
                                />
                            }
                        />
                    )}
                </PageBand.Controls>
            </PageBand>
            <ArtifactLibraryContextMenu
                actions={actions}
                className="artifact-library-drop block min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
                items={items}
                onUpload={(id) =>
                    id === 'upload-folder' ? pickers.openFolder() : pickers.openFiles()
                }
                selection={selection}
                selectionActions={bulk.selection}
                triggerProps={{
                    'data-drop-target': drop.isFileTarget || undefined,
                    ...drop.dropProps,
                }}
            >
                <PageColumn className="artifact-library @container gap-6 pt-4" ref={scrollRef}>
                    <ArtifactUploadStatus
                        onCancel={upload.abort}
                        onDismiss={upload.dismiss}
                        state={upload.state}
                    />
                    <ArtifactLibraryContent
                        dragAndDropHooks={drag.dragAndDropHooks}
                        dropTarget={drop.moveTarget}
                        filtered={Boolean(params.creator || query.trim() || params.kind !== 'all')}
                        filters={filters}
                        folders={folders}
                        library={library}
                        onOpenFile={openFile}
                        onOpenFolder={params.openFolder}
                        onShowFolder={(artifact: ArtifactRecord) => {
                            const folder = artifactPathParent(artifact.path);
                            return {
                                href: libraryHref(slug, { ...filters, folder }),
                                onOpen: () => {
                                    rememberLibraryItem(folder, artifact.artifact_id);
                                    picked.pick(folder, artifact.artifact_id);
                                },
                            };
                        }}
                        onUpload={pickers.openFiles}
                        selection={selection}
                        serverId={serverId}
                    />
                </PageColumn>
            </ArtifactLibraryContextMenu>
            {pickers.inputs}
            {dialogs}
            {bulk.dialogs}
            <ArtifactUploadConfirm
                onCancel={upload.cancel}
                onConfirm={upload.confirm}
                plan={upload.state.phase === 'confirm' ? upload.state.plan : null}
            />
        </ArtifactActionsContext>
    );
}
