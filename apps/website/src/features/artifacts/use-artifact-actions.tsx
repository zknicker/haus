import { type ArtifactMetadata, type ArtifactPublicLink, artifactPathParent } from '@haus/api';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { useServerContext } from '../servers/server-context.ts';
import { appLink } from '../servers/server-routes.ts';
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
import { copyArtifactLink } from './artifact-link.ts';
import { ArtifactMoveDialog } from './artifact-move-dialog.tsx';
import { ArtifactRenameDialog, type ArtifactRenameTarget } from './artifact-rename-dialog.tsx';
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
    fileActions: (
        file: ActionFile,
        publicLink: ArtifactPublicLink | null
    ) => ArtifactAction<FileActionId>[];
    folderActions: readonly ArtifactAction<FolderActionId>[];
    runFile: (id: FileActionId, file: ActionFile) => void;
    runFolder: (id: FolderActionId, path: string) => void;
}

/**
 * The one owner of file and folder actions on a surface (the library, or one
 * file's viewer): it decides which actions this viewer may run, runs them, and
 * renders the rename, move, and delete dialogs once. `dialogs` mounts beside
 * the surface; `actions` feeds every menu on it.
 */
export function useArtifactActions(input: {
    onOpenFile?: (file: ActionFile) => void;
    onOpenFolder?: (path: string) => void;
    serverId: string;
    slug: string;
    surface: FileActionSurface;
}): { actions: ArtifactActions; dialogs: React.ReactNode } {
    const { onOpenFile, onOpenFolder, serverId, slug, surface } = input;
    const { server } = useServerContext();
    const directory = useArtifactCreatorDirectory(serverId);
    const navigate = useNavigate();
    const { saveFile } = useArtifactSave(serverId);
    const publicLinks = usePublicLinkActions(serverId);
    const [renaming, setRenaming] = React.useState<ArtifactRenameTarget | null>(null);
    const [moving, setMoving] = React.useState<ArtifactRenameTarget | null>(null);
    const [deleting, setDeleting] = React.useState<
        (ArtifactDeleteTarget & { path: string }) | null
    >(null);
    const fileTarget = (file: ActionFile) =>
        ({ kind: 'file', path: file.path, revisionId: file.revision_id }) as const;

    const actions: ArtifactActions = {
        fileActions: (file, publicLink) =>
            fileActions(surface, {
                canDelete: canDeleteArtifact({
                    creator: file.creator,
                    isSelf: directory.isSelf,
                    role: server.role,
                }),
                canDisablePublicLink: publicLink?.can_disable ?? false,
            }),
        folderActions,
        runFile: (id, file) => {
            switch (id) {
                case 'open':
                    onOpenFile?.(file);
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
                case 'rename':
                    setRenaming(fileTarget(file));
                    return;
                case 'move':
                    setMoving(fileTarget(file));
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
                case 'copy-link':
                    void copyArtifactLink(
                        appLink(libraryHref(slug, { creator: null, folder: path, kind: 'all' }))
                    );
                    return;
                case 'rename':
                    setRenaming({ kind: 'folder', path });
                    return;
                case 'move':
                    setMoving({ kind: 'folder', path });
                    return;
            }
        },
    };

    const dialogs = (
        <>
            <ArtifactRenameDialog
                onClose={() => setRenaming(null)}
                serverId={serverId}
                target={renaming}
            />
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
                                  libraryHref(slug, {
                                      creator: null,
                                      folder: artifactPathParent(deleting.path),
                                      kind: 'all',
                                  }),
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
