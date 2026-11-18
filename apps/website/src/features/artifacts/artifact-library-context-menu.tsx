import type { ArtifactMetadata, ArtifactPublicLink } from '@haus/api';
import { ContextMenu } from '@heroui-pro/react';
import * as React from 'react';
import { artifactActionItems } from './artifact-action-items.tsx';
import {
    type FileActionId,
    type FolderActionId,
    type LibraryAreaActionId,
    libraryAreaActions,
    type SelectionActionId,
} from './artifact-actions.ts';
import { type LibraryItem, selectedLibraryItems } from './library-items.ts';
import type { LibrarySelection } from './library-selection.ts';
import type { ArtifactActions } from './use-artifact-actions.tsx';
import type { SelectionActions } from './use-selection-actions.tsx';

/** What a right-click landed on. */
export type LibraryMenuTarget =
    | { file: ArtifactMetadata; kind: 'file'; publicLink: ArtifactPublicLink | null }
    | { kind: 'folder'; path: string }
    | { items: LibraryItem[]; kind: 'selection' }
    | { kind: 'area' };

/**
 * The library's one right-click menu, Finder's: it wraps the whole scroll
 * area, so a row, a tile, or the empty space between them each get their own
 * actions. Right-clicking inside a selection of several items acts on all of
 * them; right-clicking any other item selects it first; the empty area clears
 * the selection. Shift+F10 and the Menu key open the same menu at the focused
 * item. Keys follow Finder: F2 renames the one selected item in place,
 * Delete or Backspace deletes the selection, and Command-Shift-M moves it.
 */
export function ArtifactLibraryContextMenu({
    actions,
    children,
    className,
    items,
    onUpload,
    selection,
    selectionActions,
    triggerProps,
}: {
    actions: ArtifactActions;
    children: React.ReactNode;
    className: string;
    /** Every item on screen, in visual order. */
    items: readonly LibraryItem[];
    onUpload: (id: LibraryAreaActionId) => void;
    selection: LibrarySelection;
    selectionActions: SelectionActions;
    triggerProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, unknown>;
}) {
    const [target, setTarget] = React.useState<LibraryMenuTarget>({ kind: 'area' });
    const selected = () => selectedLibraryItems(selection.keys, items);
    const itemFor = (key: string | null) => items.find((item) => item.key === key) ?? null;

    const onContextMenuCapture = (event: React.MouseEvent) => {
        const item = itemFor(itemKeyAt(event.target));
        if (!item) {
            selection.clear();
            setTarget({ kind: 'area' });
            return;
        }
        const current = selected();
        if (current.length > 1 && current.some((entry) => entry.key === item.key)) {
            setTarget({ items: current, kind: 'selection' });
            return;
        }
        selection.onChange(new Set([item.key]));
        setTarget(menuTarget(item));
    };

    // A press on the empty area (not an item, not a control) clears the selection, as in Finder.
    const onPointerDown = (event: React.PointerEvent) => {
        if (event.button === 0 && !itemElementAt(event.target) && !controlAt(event.target)) {
            selection.clear();
        }
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const command = editableAt(event.target) ? null : libraryKeyCommand(event);
        if (!command) {
            return;
        }
        const current = selected();
        if (command === 'menu') {
            openMenuAt(event, current[0]?.key ?? null);
            return;
        }
        if (command === 'rename') {
            const item =
                itemFor(itemKeyAt(event.target)) ?? (current.length === 1 ? current[0] : null);
            if (item) {
                event.preventDefault();
                rename(actions, item);
            }
            return;
        }
        if (current.length > 0) {
            event.preventDefault();
            selectionActions.run(command, current);
        }
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger
                className={className}
                {...triggerProps}
                onContextMenuCapture={onContextMenuCapture}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
            >
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <TargetMenu
                    actions={actions}
                    onUpload={onUpload}
                    selectionActions={selectionActions}
                    target={target}
                />
            </ContextMenu.Popover>
        </ContextMenu>
    );
}

function TargetMenu({
    actions,
    onUpload,
    selectionActions,
    target,
}: {
    actions: ArtifactActions;
    onUpload: (id: LibraryAreaActionId) => void;
    selectionActions: SelectionActions;
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
                    {artifactActionItems(actions.folderActions(target.path))}
                </ContextMenu.Menu>
            );
        case 'selection':
            return (
                <ContextMenu.Menu
                    aria-label={`Actions for ${target.items.length} items`}
                    onAction={(key) => selectionActions.run(key as SelectionActionId, target.items)}
                >
                    {artifactActionItems(selectionActions.actions(target.items))}
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

/**
 * Finder's keys over the library: F2 renames, Delete or Backspace deletes,
 * Command-Shift-M moves (no Finder key exists; M for Move), and Shift+F10 or
 * the Menu key opens the context menu.
 */
function libraryKeyCommand(
    event: React.KeyboardEvent
): 'delete' | 'menu' | 'move' | 'rename' | null {
    if (event.key === 'F2') {
        return 'rename';
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
        return 'delete';
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
        return 'move';
    }
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        return 'menu';
    }
    return null;
}

function menuTarget(item: LibraryItem): LibraryMenuTarget {
    return item.kind === 'file'
        ? { file: item.file, kind: 'file', publicLink: item.publicLink }
        : { kind: 'folder', path: item.path };
}

function rename(actions: ArtifactActions, item: LibraryItem) {
    if (item.kind === 'file') {
        actions.runFile('rename', item.file);
    } else {
        actions.runFolder('rename', item.path);
    }
}

/** Opens the menu for the focused item (or the first selected one), at that item. */
function openMenuAt(event: React.KeyboardEvent<HTMLDivElement>, selectedKey: string | null) {
    const root = event.currentTarget;
    const item =
        itemElementAt(event.target) ??
        (selectedKey ? root.querySelector(`[data-key="${CSS.escape(selectedKey)}"]`) : null);
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
}

/** React Aria marks every collection item with its key (`data-key`). */
function itemElementAt(target: EventTarget | null): Element | null {
    return target instanceof Element ? target.closest('[data-key]') : null;
}

function itemKeyAt(target: EventTarget | null): string | null {
    return itemElementAt(target)?.getAttribute('data-key') ?? null;
}

function controlAt(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('button, a, input, [role="alert"]') !== null;
}

function editableAt(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select') !== null)
    );
}
