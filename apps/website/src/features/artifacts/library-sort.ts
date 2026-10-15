import type { ArtifactFolderEntry, ArtifactListInput } from '@haus/api';
import * as React from 'react';

export type LibrarySortKey = 'name' | 'modified' | 'size' | 'kind';
export type LibrarySortDirection = 'asc' | 'desc';
export interface LibrarySort {
    by: LibrarySortKey;
    direction: LibrarySortDirection;
}

/**
 * Newest first stays the default: Agents push candidates continuously, so the
 * latest round is what a viewer opens a folder to see.
 */
export const defaultLibrarySort: LibrarySort = { by: 'modified', direction: 'desc' };

export const librarySortKeys: readonly { id: LibrarySortKey; label: string }[] = [
    { id: 'name', label: 'Name' },
    { id: 'modified', label: 'Modified' },
    { id: 'size', label: 'Size' },
    { id: 'kind', label: 'Kind' },
];

/** A key's first direction when chosen: time and size lead with the largest, text from A. */
export function initialSortDirection(by: LibrarySortKey): LibrarySortDirection {
    return by === 'modified' || by === 'size' ? 'desc' : 'asc';
}

/** Choosing the current key flips it; another key starts in its own first direction. */
export function nextLibrarySort(current: LibrarySort, by: LibrarySortKey): LibrarySort {
    if (current.by === by) {
        return { by, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    }
    return { by, direction: initialSortDirection(by) };
}

/** The list API's order for a sort. */
export function librarySortOrder(
    sort: LibrarySort
): Pick<ArtifactListInput, 'direction' | 'order'> {
    const order = { kind: 'kind', modified: 'updated', name: 'name', size: 'size' } as const;
    return { direction: sort.direction, order: order[sort.by] };
}

const naturalNames = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Folders arrive whole on the first page, so they sort here: names naturally
 * (`002` before `010`), time by their newest file, size by how many files they
 * hold. Folders have no kind, so a kind sort keeps them by name.
 */
export function sortLibraryFolders<F extends ArtifactFolderEntry>(
    folders: readonly F[],
    sort: LibrarySort
): F[] {
    const sign = sort.direction === 'asc' ? 1 : -1;
    const byName = (a: F, b: F) => naturalNames.compare(a.name, b.name);
    const compare = {
        kind: byName,
        modified: (a: F, b: F) => a.updated_at.localeCompare(b.updated_at),
        name: byName,
        size: (a: F, b: F) => a.file_count - b.file_count,
    }[sort.by];
    return [...folders].sort((a, b) => sign * compare(a, b) || byName(a, b));
}

/**
 * The per-viewer sort, kept on this device like list/grid. An external store
 * keeps every mounted library and viewer (desktop tabs) on the same choice.
 */
const storageKey = 'haus.artifacts.sort';
let sort: LibrarySort = readSort();
const listeners = new Set<() => void>();

export function useArtifactLibrarySort(): LibrarySort {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setArtifactLibrarySort(next: LibrarySort) {
    sort = next;
    try {
        window.localStorage.setItem(storageKey, `${next.by}:${next.direction}`);
    } catch {
        // Private windows and blocked storage keep the in-memory choice.
    }
    for (const listener of listeners) {
        listener();
    }
}

export function parseLibrarySort(value: string | null): LibrarySort {
    const [by, direction] = (value ?? '').split(':');
    const key = librarySortKeys.find((entry) => entry.id === by)?.id;
    return key && (direction === 'asc' || direction === 'desc')
        ? { by: key, direction }
        : defaultLibrarySort;
}

function readSort(): LibrarySort {
    try {
        return parseLibrarySort(window.localStorage.getItem(storageKey));
    } catch {
        return defaultLibrarySort;
    }
}

function getSnapshot() {
    return sort;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
