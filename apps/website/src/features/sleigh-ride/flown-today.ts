import * as React from 'react';

/**
 * The day Santa's team last flew in this browser profile, so the ride is once
 * a day across every window. Follows rides flown in other windows.
 */
export const sleighFlownStorageKey = 'haus.sleigh-ride.flown-on';

/**
 * Dev-only: any value in localStorage forces a ride on the next Inbox show,
 * whatever the hour or the record; the departure clears it. Production builds
 * ignore it.
 */
export const debugSleighStorageKey = 'haus.debug-sleigh';

let flownOn: string | null = readFlownOn();
const listeners = new Set<() => void>();

/** The `YYYY-MM-DD` day the team last flew, or null. */
export function useSleighFlownOn(): string | null {
    return React.useSyncExternalStore(subscribe, getSleighFlownOn, getSleighFlownOn);
}

export function getSleighFlownOn(): string | null {
    return flownOn;
}

/** Records today's ride for this device (`null` storage records without persisting). */
export function markSleighFlown(
    day: string,
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    if (day === flownOn) {
        return;
    }
    flownOn = day;
    try {
        storage?.setItem(sleighFlownStorageKey, day);
    } catch {
        // Storage full or blocked: the ride is still once per window session.
    }
    notify();
}

export function readDebugSleigh(): boolean {
    if (!import.meta.env.DEV) {
        return false;
    }
    try {
        return safeLocalStorage()?.getItem(debugSleighStorageKey) != null;
    } catch {
        return false;
    }
}

export function clearDebugSleigh() {
    if (!import.meta.env.DEV) {
        return;
    }
    try {
        safeLocalStorage()?.removeItem(debugSleighStorageKey);
    } catch {
        // Nothing to clear.
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        // Another window may have flown while nothing here was listening.
        flownOn = readFlownOn();
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
    if (event.key !== sleighFlownStorageKey && event.key !== null) {
        return;
    }
    const next = readFlownOn();
    if (next !== flownOn) {
        flownOn = next;
        notify();
    }
}

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

function readFlownOn(): string | null {
    try {
        return safeLocalStorage()?.getItem(sleighFlownStorageKey) ?? null;
    } catch {
        return null;
    }
}

function safeLocalStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
