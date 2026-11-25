import { type ArtifactRecord, artifactBatchMaxItems, artifactPathParent } from '@haus/api';
import * as React from 'react';
import type { Selection } from 'react-aria-components';
import { useNavigate } from 'react-router-dom';
import { useArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { PageBand } from '../shell/page-band.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { ArtifactLibraryContent } from './artifact-library-content.tsx';
import { ArtifactLibraryContextMenu } from './artifact-library-context-menu.tsx';
import { ArtifactLibraryFolderRow } from './artifact-library-folder-row.tsx';
import { ArtifactLibraryTools } from './artifact-library-tools.tsx';
import {
    driveAcceptsFiles,
    driveAgentName,
    driveFolderLabel,
    driveFolderTiles,
} from './drive-places.ts';
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
import { type DriveUpload, useDriveUpload } from './use-drive-upload.tsx';
import { useLibraryDrag } from './use-library-drag.tsx';
import { useLibraryDrop } from './use-library-drop.ts';
import { useLibrarySelection } from './use-library-selection.ts';
import { useSelectionActions } from './use-selection-actions.tsx';

/** What an area's workspace lends the library it hosts. */
export interface LibraryWorkspace {
    newFile: { isPending: boolean; run: () => void };
    root: string;
    upload: DriveUpload;
}

/**
 * The Server's shared drive as a Finder-style library: the open folder's
 * child folders, then its own files in the viewer's sort, as one selectable
 * collection. At the Drive root and its shelves the band carries the trail
 * and every control. Inside an area's workspace the band is only the trail,
 * identical for folders and files, and the controls sit on the folder's path
 * row. While several items are selected the controls give way to the
 * selection's actions. Folder, kind, and creator ride the URL; search and the
 * selection stay local to the folder. Files dropped anywhere, or picked from
 * Upload, land in the open folder; library items dragged onto a folder tile or
 * a crumb move there. One action owner feeds every menu.
 */
export function ArtifactLibrary({
    serverId,
    slug,
    workspace,
}: {
    serverId: string;
    slug: string;
    workspace?: LibraryWorkspace;
}) {
    const params = useArtifactLibraryParams();
    const navigate = useNavigate();
    // Search belongs to the folder it was typed in: opening another clears it.
    const [typed, setTyped] = React.useState({ folder: params.folder, text: '' });
    const search = typed.folder === params.folder ? typed.text : '';
    const query = React.useDeferredValue(search);
    const sort = useArtifactLibrarySort();
    const filters = { creator: params.creator, folder: params.folder, kind: params.kind };
    const library = useArtifactLibrary(serverId, {
        ...filters,
        query,
        sort: librarySortOrder(sort),
    });
    const agents = useAgentAppearances(serverId);
    const agentName = driveAgentName(agents);
    const acceptsFiles = driveAcceptsFiles(params.folder);
    const searching = query.trim() !== '';
    const filtered = Boolean(params.creator || searching || params.kind !== 'all');
    const folders = React.useMemo(() => {
        const sorted = sortLibraryFolders(library.folders, sort);
        // The Drive's fixed places stand even while empty; a search lists only what matches.
        return searching ? sorted : driveFolderTiles(params.folder, sorted, agents);
    }, [library.folders, sort, searching, params.folder, agents]);
    const items = React.useMemo(
        () => libraryItems(folders, library.artifacts ?? [], library.publicLinks),
        [folders, library.artifacts, library.publicLinks]
    );
    const empty = library.artifacts?.length === 0 && folders.length === 0 && !filtered;
    const ownUpload = useDriveUpload(serverId);
    const upload = workspace?.upload ?? ownUpload;
    const startUpload = (sources: Parameters<typeof upload.start>[0]) =>
        upload.start(sources, params.folder);
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
        folder: searching ? undefined : params.folder,
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
        acceptsFiles,
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
    const bandFolder = workspace?.root ?? params.folder;
    const tools = (
        <ArtifactLibraryTools
            acceptsFiles={acceptsFiles}
            actions={actions}
            empty={empty}
            folderName={driveFolderLabel(params.folder, agentName)}
            params={params}
            picked={{
                bulk: bulk.selection,
                items: selected,
                onClear: selection.clear,
                partial: selection.keys === 'all' && library.hasMore,
            }}
            placement={workspace ? 'row' : 'band'}
            search={{
                onChange: (text) => setTyped({ folder: params.folder, text }),
                value: search,
            }}
            serverId={serverId}
            upload={upload}
        />
    );

    return (
        <ArtifactActionsContext value={actions}>
            <PageBand>
                <PageBand.Trail
                    crumbs={libraryTrail(slug, { ...filters, folder: bandFolder }, drag, agentName)}
                    current={driveFolderLabel(bandFolder, agentName)}
                />
                {workspace ? null : <PageBand.Controls>{tools}</PageBand.Controls>}
            </PageBand>
            {workspace ? (
                <ArtifactLibraryFolderRow
                    agentName={agentName}
                    drag={drag}
                    folder={params.folder}
                    root={workspace.root}
                    slug={slug}
                >
                    {tools}
                </ArtifactLibraryFolderRow>
            ) : null}
            <ArtifactLibraryContextMenu
                actions={actions}
                className={
                    workspace
                        ? 'artifact-library-drop flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]'
                        : 'artifact-library-drop border-separator flex min-h-0 flex-1 flex-col overflow-y-auto border-t [scrollbar-gutter:stable]'
                }
                acceptsFiles={acceptsFiles}
                items={items}
                onAreaAction={(id) => {
                    if (id === 'recently-deleted') {
                        actions.runFolder(id, params.folder);
                    } else if (id === 'upload-folder') {
                        upload.openFolder(params.folder);
                    } else {
                        upload.openFiles(params.folder);
                    }
                }}
                selection={selection}
                selectionActions={bulk.selection}
                triggerProps={{
                    'data-drop-target': drop.isFileTarget || undefined,
                    ...drop.dropProps,
                }}
            >
                <PageColumn
                    className="artifact-library @container min-h-full max-w-none gap-4 px-3 pt-1"
                    ref={scrollRef}
                >
                    {upload.status}
                    <ArtifactLibraryContent
                        dragAndDropHooks={drag.dragAndDropHooks}
                        dropTarget={drop.moveTarget}
                        filtered={filtered}
                        filters={filters}
                        folderName={driveFolderLabel(params.folder, agentName)}
                        folders={folders}
                        library={library}
                        newFile={workspace?.newFile}
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
                        onUpload={() => upload.openFiles(params.folder)}
                        selection={selection}
                        serverId={serverId}
                    />
                </PageColumn>
            </ArtifactLibraryContextMenu>
            {workspace ? null : ownUpload.dialogs}
            {dialogs}
            {bulk.dialogs}
        </ArtifactActionsContext>
    );
}
