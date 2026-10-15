import { artifactPathBasename } from '@haus/api';
import { useDeferredValue, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useArtifactUpload } from '../../hooks/artifacts/use-artifact-upload.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { ArtifactActionsContext } from './artifact-actions-context.ts';
import { artifactPath } from './artifact-format.ts';
import { ArtifactLibraryContent } from './artifact-library-content.tsx';
import { ArtifactLibraryContextMenu } from './artifact-library-context-menu.tsx';
import { ArtifactLibraryControls } from './artifact-library-controls.tsx';
import { ArtifactUploadConfirm, ArtifactUploadStatus } from './artifact-upload-feedback.tsx';
import { ArtifactUploadMenu } from './artifact-upload-menu.tsx';
import { type ArtifactsCrumb, ArtifactsTopbar } from './artifacts-topbar.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { LibraryHistoryButtons } from './library-history-buttons.tsx';
import {
    type ArtifactLibraryView,
    libraryHref,
    useArtifactLibraryParams,
} from './library-params.ts';
import type { LibrarySelection } from './library-selection.ts';
import type { UploadSource } from './upload-plan.ts';
import { useArtifactActions } from './use-artifact-actions.tsx';
import { useLibraryFileDrop } from './use-library-file-drop.ts';
import { useUploadPickers } from './use-upload-pickers.tsx';

/**
 * The Server's shared drive as a Finder-style library: the open folder's
 * child folders, then its own files grouped by date. The band carries the
 * drive trail and every control; the column below is only content. Folder,
 * kind, and creator ride the URL; search and the selection stay local to the
 * page (a folder opens with nothing selected). Files and folders dropped
 * anywhere, or picked from Upload, land in the open folder. One action owner
 * feeds every row menu and the right-click menu.
 */
export function ArtifactLibrary({ serverId, slug }: { serverId: string; slug: string }) {
    const params = useArtifactLibraryParams();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const query = useDeferredValue(search);
    const filters = { creator: params.creator, folder: params.folder, kind: params.kind };
    const library = useArtifactLibrary(serverId, { ...filters, query });
    const upload = useArtifactUpload(serverId);
    const startUpload = (sources: UploadSource<File>[]) =>
        void upload.start(sources, params.folder);
    const pickers = useUploadPickers(startUpload);
    const drop = useLibraryFileDrop(startUpload);
    const busy = upload.state.phase === 'planning' || upload.state.phase === 'uploading';
    const crumbs = artifactFolderCrumbs(params.folder);
    const [picked, setPicked] = useState({ folder: params.folder, key: null as string | null });
    const selection: LibrarySelection = {
        onSelect: (key) => setPicked({ folder: params.folder, key }),
        selectedKey: picked.folder === params.folder ? picked.key : null,
    };
    const { actions, dialogs } = useArtifactActions({
        onOpenFile: (file) => navigate(artifactPath(slug, file.artifact_id)),
        onOpenFolder: params.openFolder,
        serverId,
        slug,
        surface: 'library',
    });

    return (
        <ArtifactActionsContext value={actions}>
            <PageTopbar>
                <ArtifactsTopbar
                    crumbs={trailCrumbs(slug, filters)}
                    current={crumbs.at(-1)?.label ?? 'Files'}
                    history={<LibraryHistoryButtons slug={slug} />}
                    slug={slug}
                >
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
                                isPending={busy}
                                onUploadFiles={pickers.openFiles}
                                onUploadFolder={pickers.openFolder}
                            />
                        }
                    />
                </ArtifactsTopbar>
            </PageTopbar>
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
                <PageColumn className="artifact-library @container gap-6 pt-4">
                    <ArtifactUploadStatus onDismiss={upload.dismiss} state={upload.state} />
                    <ArtifactLibraryContent
                        filtered={Boolean(params.creator || query.trim() || params.kind !== 'all')}
                        filters={filters}
                        library={library}
                        onOpenFolder={params.openFolder}
                        onUpload={pickers.openFiles}
                        searching={query.trim() !== ''}
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
function trailCrumbs(slug: string, view: ArtifactLibraryView): ArtifactsCrumb[] {
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
