import { artifactPathKey, artifactPathParent } from '@haus/api';
import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAgentAppearances } from '../../hooks/members/use-agents.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { ArtifactLibrary } from './artifact-library.tsx';
import { ArtifactViewer } from './artifact-viewer.tsx';
import { type DriveAdd, DriveAddMenu } from './drive-add-menu.tsx';
import { DriveNewFolderDialog } from './drive-new-folder-dialog.tsx';
import { driveAcceptsFiles, driveAgentName, driveFolderLabel } from './drive-places.ts';
import { driveTreeRoot, driveWorkspaceRoot } from './drive-tree-model.ts';
import { DriveTree, type DriveTreeOpen } from './drive-tree.tsx';
import { rememberLibraryItem } from './library-focus.ts';
import {
    artifactViewerHref,
    libraryHref,
    parseLibrarySearch,
    parseViewerContext,
} from './library-params.ts';
import { useDriveUpload } from './use-drive-upload.tsx';
import { useNewDriveFile } from './use-new-drive-file.ts';

export function DriveWorkspace({
    artifactId,
    serverId,
    slug,
}: {
    artifactId: string | null;
    serverId: string;
    slug: string;
}) {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const agentName = driveAgentName(useAgentAppearances(serverId));
    const file = hausTrpc.artifact.get.useQuery(
        { artifact_id: artifactId ?? '', revision_id: undefined, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: artifactId !== null }
    ).data?.artifact;
    const library = parseLibrarySearch(params);
    const context = artifactId === null ? null : parseViewerContext(params);
    const resolved = resolvePlace(artifactId, library.folder, file);
    const [shown, setShown] = React.useState(resolved);
    if (resolved && placeKey(resolved) !== placeKey(shown)) {
        setShown(resolved);
    }
    const place = resolved ?? shown ?? contextPlace(context?.folder ?? null);
    const filters = artifactId === null ? library : (context ?? library);
    const openFolder = (folder: string) => navigate(libraryHref(slug, { ...filters, folder }));
    const target = place ? workingFolder(place.open) : null;
    const upload = useDriveUpload(serverId, target, (folder) => {
        if (artifactId !== null) {
            openFolder(folder);
        }
    });
    const [folderParent, setFolderParent] = React.useState<string | null>(null);
    const created = useNewDriveFile(serverId, (artifact) => {
        const folder = artifactPathParent(artifact.path);
        setFolderParent(null);
        rememberLibraryItem(folder, artifact.artifact_id);
        navigate(
            artifactViewerHref(slug, artifact.artifact_id, { ...filters, folder, query: '' }),
            { state: { editing: true } }
        );
    });
    const add: DriveAdd = {
        newFile: () => (target === null ? undefined : created.file.mutate(target)),
        newFolder: () => {
            created.folder.reset();
            setFolderParent(target);
        },
        uploadFiles: upload.openFiles,
        uploadFolder: upload.openFolder,
    };
    const addMenu =
        target !== null && driveAcceptsFiles(target) ? <DriveAddMenu add={add} /> : null;

    return (
        <div className="drive-workspace @container/viewer flex min-h-0 flex-1">
            {place ? (
                <DriveTree
                    actions={addMenu}
                    className="hidden w-56 shrink-0 @3xl/viewer:flex"
                    key={artifactPathKey(place.root)}
                    label={driveFolderLabel(place.root, agentName)}
                    onOpenFile={(next) => {
                        const folder = artifactPathParent(next.path);
                        rememberLibraryItem(folder, next.artifactId);
                        navigate(
                            artifactViewerHref(slug, next.artifactId, {
                                ...filters,
                                folder,
                                query: '',
                            }),
                            { replace: artifactId !== null }
                        );
                    }}
                    onOpenFolder={openFolder}
                    open={place.open}
                    root={place.root}
                    serverId={serverId}
                />
            ) : null}
            {artifactId === null ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <ArtifactLibrary
                        serverId={serverId}
                        slug={slug}
                        workspace={{
                            add,
                            addMenu,
                            creating: created.file.isPending,
                            root: driveWorkspaceRoot(library.folder) ?? '',
                            upload,
                        }}
                    />
                </div>
            ) : (
                <ArtifactViewer
                    addMenu={addMenu}
                    artifactId={artifactId}
                    key={artifactId}
                    serverId={serverId}
                    slug={slug}
                />
            )}
            {upload.dialogs}
            <DriveNewFolderDialog
                error={created.folder.error?.message ?? null}
                isPending={created.folder.isPending}
                onClose={() => setFolderParent(null)}
                onCreate={(name) =>
                    folderParent === null
                        ? undefined
                        : created.folder.mutate({ name, parent: folderParent })
                }
                parent={folderParent}
            />
        </div>
    );
}

function workingFolder(open: DriveTreeOpen) {
    return open.kind === 'folder' ? open.path : artifactPathParent(open.path);
}

interface WorkspacePlace {
    open: DriveTreeOpen;
    root: string;
}

function resolvePlace(
    artifactId: string | null,
    folder: string,
    file: { path: string } | undefined
) {
    if (artifactId === null) {
        const root = driveWorkspaceRoot(folder);
        const place: WorkspacePlace | null =
            root === null ? null : { open: { kind: 'folder', path: folder }, root };
        return place;
    }
    if (!file) {
        return null;
    }
    const place: WorkspacePlace = {
        open: { artifactId, kind: 'file', path: file.path },
        root: driveTreeRoot(file.path),
    };
    return place;
}

function contextPlace(contextFolder: string | null) {
    const root = contextFolder === null ? null : driveWorkspaceRoot(contextFolder);
    const place: WorkspacePlace | null =
        root === null || contextFolder === null
            ? null
            : { open: { kind: 'folder', path: contextFolder }, root };
    return place;
}

function placeKey(place: WorkspacePlace | null) {
    if (!place) {
        return '';
    }
    const open = place.open.kind === 'file' ? place.open.artifactId : place.open.path;
    return `${artifactPathKey(place.root)}\n${place.open.kind}:${open}`;
}
