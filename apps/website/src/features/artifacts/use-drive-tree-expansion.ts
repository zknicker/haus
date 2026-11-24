import * as React from 'react';
import { driveTreeAncestors, driveTreeFolderId } from './drive-tree-model.ts';

interface DriveTreeExpansion {
    folders: ReadonlyMap<string, string>;
    path: string;
}

export function useDriveTreeExpansion(root: string, path: string) {
    const [state, setState] = React.useState(() => revealed(new Map(), root, path));
    let current = state;
    if (state.path !== path) {
        current = revealed(state.folders, root, path);
        setState(current);
    }
    return {
        folders: current.folders,
        setOpen: (ids: Iterable<string>, pathOf: (id: string) => string | undefined) => {
            const folders = new Map<string, string>();
            for (const id of ids) {
                const folder = current.folders.get(id) ?? pathOf(id);
                if (folder !== undefined) {
                    folders.set(id, folder);
                }
            }
            setState({ folders, path: current.path });
        },
        toggle: (folder: string) => {
            const id = driveTreeFolderId(folder);
            const folders = new Map(current.folders);
            if (!folders.delete(id)) {
                folders.set(id, folder);
            }
            setState({ folders, path: current.path });
        },
    };
}

function revealed(folders: ReadonlyMap<string, string>, root: string, path: string) {
    const next = new Map(folders);
    for (const folder of driveTreeAncestors(root, path)) {
        next.set(driveTreeFolderId(folder), folder);
    }
    const expansion: DriveTreeExpansion = { folders: next, path };
    return expansion;
}
