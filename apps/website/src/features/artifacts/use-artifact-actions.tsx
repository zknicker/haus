import {
    type ArtifactMetadata,
    type ArtifactPublicLink,
    artifactPathKey,
    artifactPathParent,
} from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { useArtifactZipDownload } from '../../hooks/artifacts/use-artifact-zip-download.ts';
import { useServerContext } from '../servers/server-context.ts';
import { appLink } from '../servers/server-routes.ts';
import { useRowTabOpeners } from '../shell/open-in-new-tab-item.tsx';
import {
    type ArtifactAction,
    canDeleteArtifact,
    type FileActionId,
    type FileActionSurface,
    type FolderActionId,
    fileActions,
    folderActions,
} from './artifact-actions.ts';
import { ArtifactDeleteDialog, type ArtifactDeleteTarget } from './artifact-delete-dialog.tsx';
import { artifactPath } from './artifact-format.ts';
import { copyArtifactLink, copyArtifactPathText } from './artifact-link.ts';
import { ArtifactMoveDialog, type ArtifactMoveTarget } from './artifact-move-dialog.tsx';
import type { ArtifactRenameTarget } from './artifact-rename.ts';
import { ArtifactRenameDialog } from './artifact-rename-dialog.tsx';
import { rememberLibraryItem } from './library-focus.ts';
import { libraryHref } from './library-params.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';
import { usePublicLinkActions } from './use-public-link-actions.ts';

/** The file in hand when an action runs. */
export type ActionFile = Pick<
    ArtifactMetadata,
    'artifact_id' | 'creator' | 'filename' | 'path' | 'revision_id' | 'stable_url' | 'version_url'
>;

/** What every file and folder menu on one surface renders and runs. */
export interface ArtifactActions {
    /** Ends the library's inline rename. */
    endRename: () => void;
    fileActions: (
        file: ActionFile,
        publicLink: ArtifactPublicLink | null
    ) => ArtifactAction<FileActionId>[];
    folderActions: (path: string) => ArtifactAction<FolderActionId>[];
    /** The library's inline rename in progress; the viewer renames in a dialog instead. */
    renaming: ArtifactRenameTarget | null;
    runFile: (id: FileActionId, file: ActionFile) => void;
    runFolder: (id: FolderActionId, path: string) => void;
}

/**
 * The one owner of file and folder actions on a surface (the library, or one
 * file's viewer): it decides which actions this viewer may run, runs them, and
 * renders the move and delete dialogs (and the viewer's rename dialog) once.
 * `dialogs` mounts beside the surface; `actions` feeds every menu on it.
 */
export function useArtifactActions(input: {
    /** The open folder, so an item elsewhere (a search hit) offers Show in folder. */
    folder?: string;
    /** Where a file opens in a new tab; its viewer by default. */
    fileHref?: (file: ActionFile) => string;
    onOpenFile?: (file: ActionFile) => void;
    onOpenFolder?: (path: string) => void;
    /** Opens `folder` with `key` selected; navigates to the library by default. */
    onShowInFolder?: (folder: string, key: string) => void;
    serverId: string;
    slug: string;
    surface: FileActionSurface;
}): { actions: ArtifactActions; dialogs: React.ReactNode } {
    const { onOpenFile, onOpenFolder, serverId, slug, surface } = input;
    const { server } = useServerContext();
    const directory = useArtifactCreatorDirectory(serverId);
    const navigate = useNavigate();
    const tabs = useRowTabOpeners();
    const { saveFile } = useArtifactSave(serverId);
    const { downloadZip } = useArtifactZipDownload(serverId);
    const publicLinks = usePublicLinkActions(serverId);
    const [renaming, setRenaming] = React.useState<ArtifactRenameTarget | null>(null);
    const [moving, setMoving] = React.useState<ArtifactMoveTarget | null>(null);
    const [deleting, setDeleting] = React.useState<
        (ArtifactDeleteTarget & { path: string }) | null
    >(null);
    const fileTarget = (file: ActionFile) =>
        ({ kind: 'file', path: file.path, revisionId: file.revision_id }) as const;
    const folderView = (folder: string) => ({ creator: null, folder, kind: 'all' }) as const;
    const context = (path: string) => ({
        canOpenInTab: tabs !== null,
        canShowInFolder:
            input.folder === undefined ||
            artifactPathKey(artifactPathParent(path)) !== artifactPathKey(input.folder),
    });
    const showInFolder = (path: string, key: string) => {
        const folder = artifactPathParent(path);
        rememberLibraryItem(folder, key);
        if (input.onShowInFolder) {
            input.onShowInFolder(folder, key);
        } else {
            navigate(libraryHref(slug, folderView(folder)));
        }
    };

    const actions: ArtifactActions = {
        endRename: () => setRenaming(null),
        fileActions: (file, publicLink) =>
            fileActions(surface, {
                ...context(file.path),
                canDelete: canDeleteArtifact({
                    creator: file.creator,
                    isSelf: directory.isSelf,
                    role: server.role,
                }),
                canDisablePublicLink: publicLink?.can_disable ?? false,
            }),
        folderActions: (path) => folderActions(context(path)),
        renaming: surface === 'library' ? renaming : null,
        runFile: (id, file) => {
            switch (id) {
                case 'open':
                    onOpenFile?.(file);
                    return;
                case 'open-new-tab':
                    tabs?.openInNewTab(
                        input.fileHref?.(file) ?? artifactPath(slug, file.artifact_id)
                    );
                    return;
                case 'show-in-folder':
                    showInFolder(file.path, file.artifact_id);
                    return;
                case 'download':
                    void saveFile({ artifactId: file.artifact_id, revisionId: file.revision_id });
                    return;
                case 'copy-link':
                    void copyArtifactLink(file.stable_url);
                    return;
                case 'copy-revision-link':
                    void copyArtifactLink(file.version_url, 'Revision link copied');
                    return;
                case 'copy-public-link':
                    void publicLinks.copy(file.artifact_id);
                    return;
                case 'disable-public-link':
                    void publicLinks.disable(file.artifact_id);
                    return;
                case 'copy-path':
                    void copyArtifactPathText(file.path);
                    return;
                case 'rename':
                    setRenaming(fileTarget(file));
                    return;
                case 'move':
                    setMoving([fileTarget(file)]);
                    return;
                case 'history':
                    // The viewer scrolls its own Revisions into view; the library opens it there.
                    if (surface === 'viewer') {
                        navigate({ hash: 'revisions' }, { replace: true });
                    } else {
                        navigate(`${artifactPath(slug, file.artifact_id)}#revisions`);
                    }
                    return;
                case 'delete':
                    setDeleting({
                        artifactId: file.artifact_id,
                        filename: file.filename,
                        path: file.path,
                    });
                    return;
            }
        },
        runFolder: (id, path) => {
            switch (id) {
                case 'open':
                    onOpenFolder?.(path);
                    return;
                case 'download':
                    // The zip names the folder itself, so it unpacks into a folder of that name.
                    void downloadZip({ paths: [path], root: artifactPathParent(path) });
                    return;
                case 'open-new-tab':
                    tabs?.openInNewTab(libraryHref(slug, folderView(path)));
                    return;
                case 'show-in-folder':
                    showInFolder(path, path);
                    return;
                case 'copy-link':
                    void copyArtifactLink(appLink(libraryHref(slug, folderView(path))));
                    return;
                case 'copy-path':
                    void copyArtifactPathText(path);
                    return;
                case 'rename':
                    setRenaming({ kind: 'folder', path });
                    return;
                case 'move':
                    setMoving([{ kind: 'folder', path }]);
                    return;
            }
        },
    };

    const dialogs = (
        <>
            {surface === 'viewer' ? (
                <ArtifactRenameDialog
                    onClose={() => setRenaming(null)}
                    serverId={serverId}
                    target={renaming}
                />
            ) : null}
            <ArtifactMoveDialog
                onClose={() => setMoving(null)}
                serverId={serverId}
                target={moving}
            />
            <ArtifactDeleteDialog
                onClose={() => setDeleting(null)}
                onDeleted={
                    surface === 'viewer' && deleting
                        ? () =>
                              // Replace: the deleted file's page becomes its folder, in this tab.
                              navigate(
                                  libraryHref(slug, folderView(artifactPathParent(deleting.path))),
                                  { replace: true }
                              )
                        : undefined
                }
                serverId={serverId}
                target={deleting}
            />
        </>
    );
    return { actions, dialogs };
}
