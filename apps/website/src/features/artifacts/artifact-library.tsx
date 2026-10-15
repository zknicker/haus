import { type ArtifactRecord, artifactPathBasename, artifactPathParent } from '@haus/api';
import { useDeferredValue, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useArtifactUpload } from '../../hooks/artifacts/use-artifact-upload.ts';
import type { BandCrumb } from '../shell/band-trail.ts';
import { PageBand } from '../shell/page-band.tsx';
import { PageColumn } from '../shell/page-column.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { ArtifactLibraryContent } from './artifact-library-content.tsx';
import { ArtifactLibraryContextMenu } from './artifact-library-context-menu.tsx';
import { ArtifactLibraryControls } from './artifact-library-controls.tsx';
import { ArtifactUploadConfirm, ArtifactUploadStatus } from './artifact-upload-feedback.tsx';
import { ArtifactUploadMenu } from './artifact-upload-menu.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { rememberLibraryItem } from './library-focus.ts';
import {
    type ArtifactLibraryView,
    type ArtifactViewerContext,
    artifactViewerHref,
    libraryHref,
    useArtifactLibraryParams,
} from './library-params.ts';
import { librarySortOrder, useArtifactLibrarySort } from './library-sort.ts';
import { useArtifactActions } from './use-artifact-actions.tsx';
import { useLibraryFileDrop } from './use-library-file-drop.ts';
import { useLibraryPick } from './use-library-pick.ts';
import { useUploadPickers } from './use-upload-pickers.tsx';

/**
 * The Server's shared drive as a Finder-style library: the open folder's
 * child folders, then its own files in the viewer's sort. The band carries
 * the drive trail and every control; the column below is only content.
 * Folder, kind, and creator ride the URL; search and the selection stay local
 * to the folder (a folder opens with its last-opened item selected, if any).
 * Files and folders dropped anywhere, or picked from Upload, land in the open
 * folder. One action owner feeds every row menu and the right-click menu.
 */
export function ArtifactLibrary({ serverId, slug }: { serverId: string; slug: string }) {
    const params = useArtifactLibraryParams();
    const navigate = useNavigate();
    // Search belongs to the folder it was typed in: opening another clears it.
    const [typed, setTyped] = useState({ folder: params.folder, text: '' });
    const search = typed.folder === params.folder ? typed.text : '';
    const setSearch = (text: string) => setTyped({ folder: params.folder, text });
    const query = useDeferredValue(search);
    const sort = useArtifactLibrarySort();
    const filters = { creator: params.creator, folder: params.folder, kind: params.kind };
    const library = useArtifactLibrary(serverId, {
        ...filters,
        query,
        sort: librarySortOrder(sort),
    });
    const upload = useArtifactUpload(serverId);
    const startUpload = (sources: Parameters<typeof upload.start>[0]) =>
        void upload.start(sources, params.folder);
    const pickers = useUploadPickers(startUpload);
    const drop = useLibraryFileDrop(startUpload);
    const crumbs = artifactFolderCrumbs(params.folder);
    const scrollRef = useRef<HTMLDivElement>(null);
    const selection = useLibraryPick(params.folder, scrollRef, library.artifacts);
    const context: ArtifactViewerContext = { ...filters, query };
    const showInFolder = (folder: string, key: string) => {
        rememberLibraryItem(folder, key);
        selection.pick(folder, key);
        params.openFolder(folder);
    };
    const { actions, dialogs } = useArtifactActions({
        fileHref: (file) => artifactViewerHref(slug, file.artifact_id, context),
        folder: query.trim() ? undefined : params.folder,
        onOpenFile: (file) => {
            rememberLibraryItem(params.folder, file.artifact_id);
            navigate(artifactViewerHref(slug, file.artifact_id, context));
        },
        onOpenFolder: params.openFolder,
        onShowInFolder: showInFolder,
        serverId,
        slug,
        surface: 'library',
    });

    return (
        <ArtifactActionsContext value={actions}>
            <PageBand>
                <PageBand.Trail
                    crumbs={trailCrumbs(slug, filters)}
                    current={crumbs.at(-1)?.label ?? 'Files'}
                />
                <PageBand.Controls>
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
                </PageBand.Controls>
            </PageBand>
            <ArtifactLibraryContextMenu
                actions={actions}
                className="artifact-library-drop block min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
                onUpload={(id) =>
                    id === 'upload-folder' ? pickers.openFolder() : pickers.openFiles()
                }
                resolve={(key) => {
                    const file = library.artifacts?.find((entry) => entry.artifact_id === key);
                    if (file) {
                        const publicLink = library.publicLinks[file.artifact_id] ?? null;
                        return { file, kind: 'file', publicLink };
                    }
                    const folder = library.folders.find((entry) => entry.path === key);
                    return folder ? { kind: 'folder', path: folder.path } : null;
                }}
                selection={selection}
                triggerProps={{
                    'data-drop-target': drop.isDropTarget || undefined,
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
                        filtered={Boolean(params.creator || query.trim() || params.kind !== 'all')}
                        filters={filters}
                        library={library}
                        onOpenFolder={params.openFolder}
                        onShowFolder={(artifact: ArtifactRecord) => {
                            const folder = artifactPathParent(artifact.path);
                            return {
                                href: libraryHref(slug, { ...filters, folder }),
                                onOpen: () => {
                                    rememberLibraryItem(folder, artifact.artifact_id);
                                    selection.pick(folder, artifact.artifact_id);
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
            <ArtifactUploadConfirm
                onCancel={upload.cancel}
                onConfirm={upload.confirm}
                plan={upload.state.phase === 'confirm' ? upload.state.plan : null}
            />
        </ArtifactActionsContext>
    );
}

/** Files, then each folder above the open one; the open folder is the trail's unlinked end. */
function trailCrumbs(slug: string, view: ArtifactLibraryView): BandCrumb[] {
    const crumbs = artifactFolderCrumbs(view.folder);
    if (crumbs.length === 0) {
        return [];
    }
    return [
        { href: libraryHref(slug, { ...view, folder: '' }), label: 'Files' },
        ...crumbs.slice(0, -1).map((crumb) => ({
            href: libraryHref(slug, { ...view, folder: crumb.path }),
            label: crumb.label,
        })),
    ];
}
