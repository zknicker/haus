import * as React from 'react';

/**
 * Per-device switch for message notifications (ADR 0038). It is on only when
 * the reader turned it on here and the platform granted permission;
 * permission is requested from the Settings toggle, never on page load.
 */
// Persisted key predates the rename; changing it resets every user's choice.
const storageKey = 'haus.notifications.needsYou';

export type NotificationPermissionState = 'default' | 'denied' | 'granted' | 'unsupported';

let enabled = readMessageNotificationsPreference();
const listeners = new Set<() => void>();

export function useMessageNotificationsPreference(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setMessageNotificationsPreference(next: boolean) {
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
export function readMessageNotificationsPreference(
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
export async function enableMessageNotifications(): Promise<NotificationPermissionState> {
    if (typeof Notification === 'undefined') {
        return 'unsupported';
    }
    const permission =
        Notification.permission === 'default'
            ? await Notification.requestPermission()
            : Notification.permission;
    if (permission === 'granted') {
        setMessageNotificationsPreference(true);
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
