import * as React from 'react';

/**
 * Per-device switch for the Open threads UI: the sidebar section, the command
 * menu group, and Close. Server reads and PR status are unaffected. An external
 * store shares it without a provider.
 */
const storageKey = 'haus.showOpenThreads';

let showOpenThreads = readShowOpenThreads();
const listeners = new Set<() => void>();

export function useShowOpenThreads(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setShowOpenThreads(next: boolean) {
    showOpenThreads = next;
    try {
        window.localStorage.setItem(storageKey, next ? 'on' : 'off');
    } catch {
        // A blocked store only costs remembering the choice.
    }
    for (const listener of listeners) {
        listener();
    }
}

/** On unless a reader turned it off; anything unrecognized stays on. */
export function readShowOpenThreads(storage?: Pick<Storage, 'getItem'>): boolean {
    try {
        const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
        return store?.getItem(storageKey) !== 'off';
    } catch {
        return true;
    }
}

export const showOpenThreadsStorageKey = storageKey;

function getSnapshot() {
    return showOpenThreads;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
