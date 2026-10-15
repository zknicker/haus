import type { ArtifactMetadata, ArtifactPublicLink } from '@haus/api';
import { ContextMenu } from '@heroui-pro/react';
import * as React from 'react';
import { artifactActionItems } from './artifact-action-items.tsx';
import {
    type FileActionId,
    type FolderActionId,
    type LibraryAreaActionId,
    libraryAreaActions,
} from './artifact-actions.ts';
import type { LibrarySelection } from './library-selection.ts';
import type { ArtifactActions } from './use-artifact-actions.tsx';

/** What a right-click landed on. */
export type LibraryMenuTarget =
    | { file: ArtifactMetadata; kind: 'file'; publicLink: ArtifactPublicLink | null }
    | { kind: 'folder'; path: string }
    | { kind: 'area' };

/**
 * The library's one right-click menu, Finder's: it wraps the whole scroll
 * area, so a row, a tile, or the empty space between them each get their own
 * actions. Right-clicking an item selects it first. Shift+F10 and the Menu key
 * open the same menu for the focused (or selected) item, at that item. The
 * actions are the ones every ⋮ menu shows (`useArtifactActions`).
 */
export function ArtifactLibraryContextMenu({
    actions,
    children,
    className,
    onUpload,
    resolve,
    selection,
    triggerProps,
}: {
    actions: ArtifactActions;
    children: React.ReactNode;
    className: string;
    onUpload: (id: LibraryAreaActionId) => void;
    /** The item a row or tile key names; null for none. */
    resolve: (key: string) => Exclude<LibraryMenuTarget, { kind: 'area' }> | null;
    selection: LibrarySelection;
    triggerProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>;
}) {
    const [target, setTarget] = React.useState<LibraryMenuTarget>({ kind: 'area' });

    const onContextMenuCapture = (event: React.MouseEvent) => {
        const key = itemKeyAt(event.target);
        const item = key === null ? null : resolve(key);
        // Finder: right-clicking an item selects it; the empty area clears the selection.
        selection.onSelect(item ? key : null);
        setTarget(item ?? { kind: 'area' });
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu')) {
            return;
        }
        const root = event.currentTarget;
        const focused = itemElementAt(event.target);
        const item =
            focused ??
            (selection.selectedKey
                ? root.querySelector(`[data-key="${CSS.escape(selection.selectedKey)}"]`)
                : null);
        if (!item) {
            return;
        }
        event.preventDefault();
        const rect = item.getBoundingClientRect();
        item.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + Math.min(32, rect.width / 2),
                clientY: rect.top + rect.height / 2,
            })
        );
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger
                className={className}
                {...triggerProps}
                onContextMenuCapture={onContextMenuCapture}
                onKeyDown={onKeyDown}
            >
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <TargetMenu actions={actions} onUpload={onUpload} target={target} />
            </ContextMenu.Popover>
        </ContextMenu>
    );
}

function TargetMenu({
    actions,
    onUpload,
    target,
}: {
    actions: ArtifactActions;
    onUpload: (id: LibraryAreaActionId) => void;
    target: LibraryMenuTarget;
}) {
    switch (target.kind) {
        case 'file':
            return (
                <ContextMenu.Menu
                    aria-label={`Actions for ${target.file.filename}`}
                    onAction={(key) => actions.runFile(key as FileActionId, target.file)}
                >
                    {artifactActionItems(actions.fileActions(target.file, target.publicLink))}
                </ContextMenu.Menu>
            );
        case 'folder':
            return (
                <ContextMenu.Menu
                    aria-label="Folder actions"
                    onAction={(key) => actions.runFolder(key as FolderActionId, target.path)}
                >
                    {artifactActionItems(actions.folderActions)}
                </ContextMenu.Menu>
            );
        case 'area':
            return (
                <ContextMenu.Menu
                    aria-label="Upload"
                    onAction={(key) => onUpload(key as LibraryAreaActionId)}
                >
                    {artifactActionItems(libraryAreaActions)}
                </ContextMenu.Menu>
            );
    }
}

/** React Aria marks every collection item with its key (`data-key`). */
function itemElementAt(target: EventTarget | null): Element | null {
    return target instanceof Element ? target.closest('[data-key]') : null;
}

function itemKeyAt(target: EventTarget | null): string | null {
    return itemElementAt(target)?.getAttribute('data-key') ?? null;
}
