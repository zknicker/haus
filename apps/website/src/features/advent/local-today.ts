import * as React from 'react';

/** A calendar date in the member's local time zone; `month` is 1-based. */
export interface LocalDay {
    readonly day: number;
    readonly month: number;
    readonly year: number;
}

/**
 * Dev-only override for seasonal features: `YYYY-MM-DD` in localStorage
 * pretends today is that date, so December flourishes can be checked in
 * November. Production builds ignore it.
 */
export const debugTodayStorageKey = 'haus.debug-today';

/** Today in local time; follows midnight and the dev override. */
export function useLocalToday(): LocalDay {
    return React.useSyncExternalStore(subscribe, getLocalToday, getLocalToday);
}

/** Today from `now` in local time, or from a valid `YYYY-MM-DD` override. */
export function readLocalToday(now: Date, override: string | null): LocalDay {
    return (
        parseDebugToday(override) ?? {
            day: now.getDate(),
            month: now.getMonth() + 1,
            year: now.getFullYear(),
        }
    );
}

/** A real calendar date from `YYYY-MM-DD`, or null. */
export function parseDebugToday(value: string | null): LocalDay | null {
    const match = value === null ? null : debugTodayPattern.exec(value.trim());
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const probe = new Date(year, month - 1, day);
    const isRealDate =
        probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
    return isRealDate ? { day, month, year } : null;
}

const debugTodayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const listeners = new Set<() => void>();
let cachedToday: LocalDay | null = null;
let midnightTimer: ReturnType<typeof setTimeout> | null = null;

function getLocalToday(): LocalDay {
    const next = readLocalToday(new Date(), readDebugOverride());
    if (
        cachedToday?.year === next.year &&
        cachedToday.month === next.month &&
        cachedToday.day === next.day
    ) {
        return cachedToday;
    }
    cachedToday = next;
    return next;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', followStorage);
        scheduleMidnight();
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
            window.removeEventListener('storage', followStorage);
            clearMidnight();
        }
    };
}

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

function followStorage(event: StorageEvent) {
    if (event.key === debugTodayStorageKey || event.key === null) {
        notify();
    }
}

function scheduleMidnight() {
    clearMidnight();
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    // A second of slack lands safely on the new day.
    midnightTimer = setTimeout(
        () => {
            notify();
            scheduleMidnight();
        },
        nextMidnight.getTime() - now.getTime() + 1000
    );
}

function clearMidnight() {
    if (midnightTimer !== null) {
        clearTimeout(midnightTimer);
        midnightTimer = null;
    }
}

function readDebugOverride(): string | null {
    if (!import.meta.env.DEV) {
        return null;
    }
    try {
        return typeof window === 'undefined'
            ? null
            : window.localStorage.getItem(debugTodayStorageKey);
    } catch {
        return null;
    }
}
