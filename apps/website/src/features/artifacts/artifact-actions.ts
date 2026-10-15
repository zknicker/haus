import type { ArtifactCreator } from '@haus/api';
import type { HugeiconsIconProps } from '@hugeicons/react';
import {
    ArrowUpRight01Icon,
    Copy01Icon,
    CopyLinkIcon,
    Delete02Icon,
    Download01Icon,
    Edit02Icon,
    FileUploadIcon,
    FolderOpenIcon,
    FolderTransferIcon,
    FolderUploadIcon,
    Globe02Icon,
    Link01Icon,
    PlusSignIcon,
    Unlink02Icon,
    WorkHistoryIcon,
} from '@hugeicons-pro/core-stroke-rounded';

/**
 * Every action a file or folder offers, defined once. The row ⋮ menu, the
 * library's right-click menu, and the viewer's menu all render these lists,
 * so they cannot drift apart. An action the viewer cannot perform is left out
 * of its list rather than shown disabled. Each carries the icon the App's
 * other menus use for the same verb.
 */
export type FileActionId =
    | 'open'
    | 'open-new-tab'
    | 'show-in-folder'
    | 'download'
    | 'copy-link'
    | 'copy-revision-link'
    | 'copy-public-link'
    | 'disable-public-link'
    | 'copy-path'
    | 'rename'
    | 'move'
    | 'history'
    | 'delete';

export type FolderActionId =
    | 'download'
    | 'open'
    | 'open-new-tab'
    | 'show-in-folder'
    | 'copy-link'
    | 'copy-path'
    | 'rename'
    | 'move';

/** The library's empty area: what lands in the open folder. */
export type LibraryAreaActionId = 'upload-files' | 'upload-folder';

export interface ArtifactAction<Id extends string = string> {
    /** Destructive: drawn in the danger variant. */
    danger?: boolean;
    /** Actions sharing a group sit together; a separator falls between groups. */
    group: number;
    icon: HugeiconsIconProps['icon'];
    id: Id;
    label: string;
}

/** Where the file's actions are offered: anywhere in the library, or its own viewer. */
export type FileActionSurface = 'library' | 'viewer';

/** Where the menu stands relative to the item: what it can do and what it can reach. */
export interface ItemActionContext {
    /** A desktop window, whose tabs an item can open into (ADR 0046); the web has none. */
    canOpenInTab: boolean;
    /** The item lives somewhere other than the folder on screen (a viewer, a search hit). */
    canShowInFolder: boolean;
}

export interface FileActionAccess extends ItemActionContext {
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
        viewer ? null : { group: 0, icon: ArrowUpRight01Icon, id: 'open', label: 'Open' },
        access.canOpenInTab
            ? { group: 0, icon: PlusSignIcon, id: 'open-new-tab', label: 'Open in new tab' }
            : null,
        access.canShowInFolder
            ? { group: 0, icon: FolderOpenIcon, id: 'show-in-folder', label: 'Show in folder' }
            : null,
        { group: 1, icon: Download01Icon, id: 'download', label: 'Download' },
        { group: 1, icon: CopyLinkIcon, id: 'copy-link', label: 'Copy link' },
        viewer
            ? {
                  group: 1,
                  icon: Link01Icon,
                  id: 'copy-revision-link',
                  label: 'Copy link to this revision',
              }
            : null,
        { group: 1, icon: Globe02Icon, id: 'copy-public-link', label: 'Copy public link' },
        access.canDisablePublicLink
            ? {
                  group: 1,
                  icon: Unlink02Icon,
                  id: 'disable-public-link',
                  label: 'Disable public link',
              }
            : null,
        { group: 1, icon: Copy01Icon, id: 'copy-path', label: 'Copy path' },
        { group: 2, icon: Edit02Icon, id: 'rename', label: viewer ? 'Rename…' : 'Rename' },
        { group: 2, icon: FolderTransferIcon, id: 'move', label: 'Move to…' },
        { group: 2, icon: WorkHistoryIcon, id: 'history', label: 'Version history' },
        access.canDelete
            ? { danger: true, group: 3, icon: Delete02Icon, id: 'delete', label: 'Delete…' }
            : null,
    ];
    return actions.filter((action) => action !== null);
}

export function folderActions(context: ItemActionContext): ArtifactAction<FolderActionId>[] {
    const actions: (ArtifactAction<FolderActionId> | null)[] = [
        { group: 0, icon: ArrowUpRight01Icon, id: 'open', label: 'Open' },
        context.canOpenInTab
            ? { group: 0, icon: PlusSignIcon, id: 'open-new-tab', label: 'Open in new tab' }
            : null,
        context.canShowInFolder
            ? { group: 0, icon: FolderOpenIcon, id: 'show-in-folder', label: 'Show in folder' }
            : null,
        { group: 1, icon: Download01Icon, id: 'download', label: 'Download as zip' },
        { group: 1, icon: CopyLinkIcon, id: 'copy-link', label: 'Copy link' },
        { group: 1, icon: Copy01Icon, id: 'copy-path', label: 'Copy path' },
        { group: 2, icon: Edit02Icon, id: 'rename', label: 'Rename' },
        { group: 2, icon: FolderTransferIcon, id: 'move', label: 'Move to…' },
    ];
    return actions.filter((action) => action !== null);
}

/** What a selection of several items offers; single-item actions (Open, Rename…) drop out. */
export type SelectionActionId = 'download' | 'copy-links' | 'move' | 'delete';

export function selectionActions(access: {
    /** Selected files this member may delete; Delete… is hidden when there are none. */
    deletable: number;
}): ArtifactAction<SelectionActionId>[] {
    const actions: (ArtifactAction<SelectionActionId> | null)[] = [
        { group: 0, icon: Download01Icon, id: 'download', label: 'Download as zip' },
        { group: 0, icon: CopyLinkIcon, id: 'copy-links', label: 'Copy links' },
        { group: 1, icon: FolderTransferIcon, id: 'move', label: 'Move to…' },
        access.deletable > 0
            ? { danger: true, group: 2, icon: Delete02Icon, id: 'delete', label: 'Delete…' }
            : null,
    ];
    return actions.filter((action) => action !== null);
}

export const libraryAreaActions: readonly ArtifactAction<LibraryAreaActionId>[] = [
    { group: 0, icon: FileUploadIcon, id: 'upload-files', label: 'Upload files…' },
    { group: 0, icon: FolderUploadIcon, id: 'upload-folder', label: 'Upload folder…' },
];

/** Mirrors the Server's delete rule: the original author or a human Owner/Admin. */
export function canDeleteArtifact(input: {
    creator: ArtifactCreator;
    isSelf: (creator: ArtifactCreator) => boolean;
    role: 'owner' | 'admin' | 'member';
}): boolean {
    return input.role === 'owner' || input.role === 'admin' || input.isSelf(input.creator);
}
