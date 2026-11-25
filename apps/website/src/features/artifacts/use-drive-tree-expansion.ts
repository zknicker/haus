import { artifactPathKey } from '@haus/api';
import * as React from 'react';
import {
    driveTreeAncestors,
    driveTreeFolderAncestors,
    driveTreeFolderId,
} from './drive-tree-model.ts';

export interface DriveTreeTarget {
    kind: 'file' | 'folder';
    path: string;
}

interface DriveTreeExpansion {
    cascading: boolean;
    folders: ReadonlyMap<string, string>;
    target: string | null;
}

const closed: DriveTreeExpansion = { cascading: false, folders: new Map(), target: null };
const expansions = new Map<string, DriveTreeExpansion>();
const listeners = new Set<() => void>();

export function useDriveTreeExpansion(root: string, target: DriveTreeTarget) {
    const area = artifactPathKey(root);
    const targetKey = `${target.kind}:${artifactPathKey(target.path)}`;
    const stored = React.useSyncExternalStore(subscribe, () => expansions.get(area) ?? closed);
    const current =
        stored.target === targetKey ? stored : revealed(stored, root, target, targetKey);
    React.useLayoutEffect(() => {
        const latest = expansions.get(area) ?? closed;
        if (latest.target !== targetKey) {
            write(
                area,
                revealed(latest, root, { kind: target.kind, path: target.path }, targetKey)
            );
        }
    }, [area, root, target.kind, target.path, targetKey]);
    const save = (next: Omit<DriveTreeExpansion, 'target'>) =>
        write(area, { ...next, target: current.target });

    return {
        cascading: current.cascading,
        collapseAll: () => save({ cascading: false, folders: new Map() }),
        expandAll: (folders: Iterable<{ id: string; path: string }>) => {
            const next = new Map(current.folders);
            for (const folder of folders) {
                next.set(folder.id, folder.path);
            }
            if (next.size !== current.folders.size || !current.cascading) {
                save({ cascading: true, folders: next });
            }
        },
        folders: current.folders,
        open: (folder: string) => {
            const id = driveTreeFolderId(folder);
            if (!current.folders.has(id)) {
                save({
                    cascading: current.cascading,
                    folders: new Map(current.folders).set(id, folder),
                });
            }
        },
        setOpen: (ids: Iterable<string>, pathOf: (id: string) => string | undefined) => {
            const folders = new Map<string, string>();
            for (const id of ids) {
                const folder = current.folders.get(id) ?? pathOf(id);
                if (folder !== undefined) {
                    folders.set(id, folder);
                }
            }
            const shut = [...current.folders.keys()].some((id) => !folders.has(id));
            save({ cascading: current.cascading && !shut, folders });
        },
    };
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function write(area: string, next: DriveTreeExpansion) {
    expansions.set(area, next);
    for (const listener of listeners) {
        listener();
    }
}

function revealed(
    expansion: DriveTreeExpansion,
    root: string,
    target: DriveTreeTarget,
    targetKey: string
) {
    const folders = new Map(expansion.folders);
    const reveal =
        target.kind === 'folder'
            ? driveTreeFolderAncestors(root, target.path)
            : driveTreeAncestors(root, target.path);
    for (const folder of reveal) {
        folders.set(driveTreeFolderId(folder), folder);
    }
    const next: DriveTreeExpansion = { cascading: expansion.cascading, folders, target: targetKey };
    return next;
}
