import * as React from 'react';

/**
 * Per-device switch for Needs you notifications (ADR 0037). It is on only
 * when the reader turned it on here and the platform granted permission;
 * permission is requested from the Settings toggle, never on page load.
 */
const storageKey = 'haus.notifications.needsYou';

export type NotificationPermissionState = 'default' | 'denied' | 'granted' | 'unsupported';

let enabled = readNeedsYouNotificationsPreference();
const listeners = new Set<() => void>();

export function useNeedsYouNotificationsPreference(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setNeedsYouNotificationsPreference(next: boolean) {
    enabled = next;
    try {
        window.localStorage.setItem(storageKey, next ? 'on' : 'off');
    } catch {
        // Storage can be unavailable (private mode); the in-memory switch still holds.
    }
    for (const listener of listeners) {
        listener();
    }
}

/** Nothing stored and anything unrecognized both mean off. */
export function readNeedsYouNotificationsPreference(
    storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined'
        ? undefined
        : window.localStorage
): boolean {
    try {
        return storage?.getItem(storageKey) === 'on';
    } catch {
        return false;
    }
}

export function notificationPermission(): NotificationPermissionState {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/**
 * Turning the switch on asks the platform first and only sticks once granted,
 * so the switch never reads on while nothing can be shown.
 */
export async function enableNeedsYouNotifications(): Promise<NotificationPermissionState> {
    if (typeof Notification === 'undefined') {
        return 'unsupported';
    }
    const permission =
        Notification.permission === 'default'
            ? await Notification.requestPermission()
            : Notification.permission;
    if (permission === 'granted') {
        setNeedsYouNotificationsPreference(true);
    }
    return permission;
}

function getSnapshot() {
    return enabled;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
