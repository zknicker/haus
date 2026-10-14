import { artifactPathBasename } from '@haus/api';
import { useDeferredValue, useState } from 'react';
import { useArtifactLibrary } from '../../hooks/artifacts/use-artifact-library.ts';
import { useArtifactUpload } from '../../hooks/artifacts/use-artifact-upload.ts';
import { PageColumn } from '../shell/page-column.tsx';
import { PageTopbar } from '../shell/shell-topbar.tsx';
import { ArtifactCreatorMenu } from './artifact-creator-menu.tsx';
import { ArtifactLibraryContent } from './artifact-library-content.tsx';
import { ArtifactLibraryControls } from './artifact-library-controls.tsx';
import { ArtifactUploadConfirm, ArtifactUploadStatus } from './artifact-upload-feedback.tsx';
import { ArtifactUploadMenu } from './artifact-upload-menu.tsx';
import { ArtifactsTopbar } from './artifacts-topbar.tsx';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { libraryHref, useArtifactLibraryParams } from './library-params.ts';
import type { UploadSource } from './upload-plan.ts';
import { useLibraryFileDrop } from './use-library-file-drop.ts';
import { useUploadPickers } from './use-upload-pickers.tsx';

/**
 * The Server's shared drive as a Finder-style library: the open folder's
 * child folders, then its own files grouped by date. The band carries the
 * drive trail and every control; the column below is only content. Folder,
 * kind, and creator ride the URL; search stays local to the page. Files and
 * folders dropped anywhere, or picked from Upload, land in the open folder.
 */
export function ArtifactLibrary({ serverId, slug }: { serverId: string; slug: string }) {
    const params = useArtifactLibraryParams();
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

    return (
        <>
            <PageTopbar>
                <ArtifactsTopbar
                    crumbs={
                        crumbs.length === 0
                            ? []
                            : [
                                  {
                                      href: libraryHref(slug, { ...filters, folder: '' }),
                                      label: 'Files',
                                  },
                                  ...crumbs.slice(0, -1).map((crumb) => ({
                                      href: libraryHref(slug, { ...filters, folder: crumb.path }),
                                      label: crumb.label,
                                  })),
                              ]
                    }
                    current={crumbs.at(-1)?.label ?? 'Files'}
                    slug={slug}
                >
                    <ArtifactLibraryControls
                        creatorMenu={
                            <ArtifactCreatorMenu
                                creator={params.creator}
                                onCreatorChange={params.selectCreator}
                                serverId={serverId}
                            />
                        }
                        folderName={params.folder ? artifactPathBasename(params.folder) : null}
                        kind={params.kind}
                        onKindChange={params.selectKind}
                        onSearchChange={setSearch}
                        search={search}
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
            <div
                className="artifact-library-drop min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
                data-drop-target={drop.isDropTarget || undefined}
                {...drop.dropProps}
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
                        serverId={serverId}
                        slug={slug}
                    />
                </PageColumn>
            </div>
            {pickers.inputs}
            <ArtifactUploadConfirm
                onCancel={upload.cancel}
                onConfirm={upload.confirm}
                plan={upload.state.phase === 'confirm' ? upload.state.plan : null}
            />
        </>
    );
}
