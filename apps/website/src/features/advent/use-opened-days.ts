import { adventDoorCount } from '@haus/api';
import * as React from 'react';

/**
 * The advent doors this member has opened, per Server and year. App-local
 * presentation: the Server reveals every door through today regardless; this
 * only remembers whether today's was opened here, so the chip's dot clears
 * and the door stays open. Shared by every consumer in the window and
 * followed across windows (storage events).
 */
export const openedDaysStoragePrefix = 'haus.advent-opened:';

const noDays: ReadonlySet<number> = new Set();
const snapshots = new Map<string, ReadonlySet<number>>();
const listeners = new Set<() => void>();

/** The opened doors for one Server's calendar year. */
export function useOpenedDays(serverId: string, year: number): ReadonlySet<number> {
    const key = openedDaysKey(serverId, year);
    const getSnapshot = React.useCallback(() => readOpenedDays(key), [key]);
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Opens one door, applying instantly and persisting for this device (`null`
 * storage applies without persisting).
 */
export function openAdventDay(
    serverId: string,
    year: number,
    day: number,
    storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()
) {
    const key = openedDaysKey(serverId, year);
    const current = readOpenedDays(key, storage);
    if (current.has(day)) {
        return;
    }
    const next: ReadonlySet<number> = new Set([...current, day]);
    snapshots.set(key, next);
    try {
        storage?.setItem(key, serializeOpenedDays(next));
    } catch {
        // A full or blocked storage still opens the door for this window.
    }
    notify();
}

export function openedDaysKey(serverId: string, year: number) {
    return `${openedDaysStoragePrefix}${serverId}:${year}`;
}

/** Valid door numbers from a stored JSON array; anything else reads as none opened. */
export function parseOpenedDays(raw: string | null): ReadonlySet<number> {
    if (raw === null) {
        return noDays;
    }
    try {
        const value: unknown = JSON.parse(raw);
        if (!Array.isArray(value)) {
            return noDays;
        }
        return new Set(value.filter(isDoor));
    } catch {
        return noDays;
    }
}

export function serializeOpenedDays(days: ReadonlySet<number>) {
    return JSON.stringify([...days].sort((a, b) => a - b));
}

function readOpenedDays(
    key: string,
    storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()
): ReadonlySet<number> {
    const cached = snapshots.get(key);
    if (cached) {
        return cached;
    }
    let raw: string | null = null;
    try {
        raw = storage?.getItem(key) ?? null;
    } catch {
        raw = null;
    }
    const days = parseOpenedDays(raw);
    snapshots.set(key, days);
    return days;
}

function isDoor(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= adventDoorCount;
}

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        // Another window may have opened a door while nothing here was listening.
        snapshots.clear();
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
    if (event.key === null || event.key.startsWith(openedDaysStoragePrefix)) {
        snapshots.clear();
        notify();
    }
}

function safeLocalStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
