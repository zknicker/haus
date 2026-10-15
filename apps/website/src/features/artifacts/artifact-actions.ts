import type { ArtifactCreator } from '@haus/api';

/**
 * Every action a file or folder offers, defined once. The row ⋮ menu, the
 * library's right-click menu, and the viewer's menu all render these lists,
 * so they cannot drift apart. An action the viewer cannot perform is left out
 * of its list rather than shown disabled.
 */
export type FileActionId =
    | 'open'
    | 'download'
    | 'copy-link'
    | 'copy-revision-link'
    | 'copy-public-link'
    | 'disable-public-link'
    | 'rename'
    | 'move'
    | 'history'
    | 'delete';

export type FolderActionId = 'open' | 'rename' | 'move' | 'copy-link';

/** The library's empty area: what lands in the open folder. */
export type LibraryAreaActionId = 'upload-files' | 'upload-folder';

export interface ArtifactAction<Id extends string = string> {
    /** Destructive: drawn in the danger variant. */
    danger?: boolean;
    /** Actions sharing a group sit together; a separator falls between groups. */
    group: number;
    id: Id;
    label: string;
}

/** Where the file's actions are offered: anywhere in the library, or its own viewer. */
export type FileActionSurface = 'library' | 'viewer';

export interface FileActionAccess {
    /** The file's creator, or a human Owner/Admin (the Server's delete rule). */
    canDelete: boolean;
    /** The file's public link exists and this viewer may turn it off. */
    canDisablePublicLink: boolean;
}

export function fileActions(
    surface: FileActionSurface,
    access: FileActionAccess
): ArtifactAction<FileActionId>[] {
    const viewer = surface === 'viewer';
    const actions: (ArtifactAction<FileActionId> | null)[] = [
        viewer ? null : { group: 0, id: 'open', label: 'Open' },
        { group: 1, id: 'download', label: 'Download' },
        { group: 1, id: 'copy-link', label: 'Copy link' },
        viewer ? { group: 1, id: 'copy-revision-link', label: 'Copy link to this revision' } : null,
        { group: 1, id: 'copy-public-link', label: 'Copy public link' },
        access.canDisablePublicLink
            ? { group: 1, id: 'disable-public-link', label: 'Disable public link' }
            : null,
        { group: 2, id: 'rename', label: 'Rename…' },
        { group: 2, id: 'move', label: 'Move to…' },
        { group: 2, id: 'history', label: 'Version history' },
        access.canDelete ? { danger: true, group: 3, id: 'delete', label: 'Delete…' } : null,
    ];
    return actions.filter((action) => action !== null);
}

export const folderActions: readonly ArtifactAction<FolderActionId>[] = [
    { group: 0, id: 'open', label: 'Open' },
    { group: 1, id: 'copy-link', label: 'Copy link' },
    { group: 2, id: 'rename', label: 'Rename…' },
    { group: 2, id: 'move', label: 'Move to…' },
];

export const libraryAreaActions: readonly ArtifactAction<LibraryAreaActionId>[] = [
    { group: 0, id: 'upload-files', label: 'Upload files…' },
    { group: 0, id: 'upload-folder', label: 'Upload folder…' },
];

/** Mirrors the Server's delete rule: the original author or a human Owner/Admin. */
export function canDeleteArtifact(input: {
    creator: ArtifactCreator;
    isSelf: (creator: ArtifactCreator) => boolean;
    role: 'owner' | 'admin' | 'member';
}): boolean {
    return input.role === 'owner' || input.role === 'admin' || input.isSelf(input.creator);
}
