import * as React from 'react';

export type ArtifactLibraryLayout = 'grid' | 'list';

/**
 * Per-device list/grid choice for the Artifacts library. An external store
 * keeps every mounted library (desktop tabs) on the same choice; storage can
 * be unavailable, in which case the choice lasts for the session.
 */
const storageKey = 'haus.artifacts.layout';

let layout: ArtifactLibraryLayout = readLayout();
const listeners = new Set<() => void>();

export function useArtifactLibraryLayout(): ArtifactLibraryLayout {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setArtifactLibraryLayout(next: ArtifactLibraryLayout) {
    layout = next;
    try {
        window.localStorage.setItem(storageKey, next);
    } catch {
        // Private windows and blocked storage keep the in-memory choice.
    }
    for (const listener of listeners) {
        listener();
    }
}

function readLayout(): ArtifactLibraryLayout {
    try {
        return window.localStorage.getItem(storageKey) === 'grid' ? 'grid' : 'list';
    } catch {
        return 'list';
    }
}

function getSnapshot() {
    return layout;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
