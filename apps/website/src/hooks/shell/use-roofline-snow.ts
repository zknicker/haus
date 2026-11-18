import * as React from 'react';
import {
    type RooflineSnow,
    readStoredRooflineSnow,
    rooflineSnowStorageKey,
    writeStoredRooflineSnow,
} from '../../lib/roofline-snow.ts';

// One per-device choice shared by every consumer in this window, on the web and desktop alike.
let rooflineSnow: RooflineSnow = readStoredRooflineSnow(safeLocalStorage());
const listeners = new Set<() => void>();

/** The live roofline snow; follows picks made in other windows. */
export function useRooflineSnow(): RooflineSnow {
    return React.useSyncExternalStore(subscribe, getRooflineSnow, getRooflineSnow);
}

export function getRooflineSnow(): RooflineSnow {
    return rooflineSnow;
}

/**
 * Applies instantly and persists for this device (`null` storage applies
 * without persisting).
 */
export function selectRooflineSnow(
    next: RooflineSnow,
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    if (next === rooflineSnow) {
        return;
    }
    rooflineSnow = next;
    writeStoredRooflineSnow(storage, next);
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        // Another window may have picked while nothing here was listening.
        rooflineSnow = readStoredRooflineSnow(safeLocalStorage());
        window.addEventListener('storage', followOtherWindows);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
            window.removeEventListener('storage', followOtherWindows);
        }
    };
}

function followOtherWindows(event: StorageEvent) {
    if (event.key === rooflineSnowStorageKey || event.key === null) {
        selectRooflineSnow(readStoredRooflineSnow(safeLocalStorage()), null);
    }
}

function safeLocalStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
