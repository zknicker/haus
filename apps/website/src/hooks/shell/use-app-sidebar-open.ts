import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

// Whether the app sidebar shows. Desktop only: View > Show/Hide Sidebar
// (Control-Command-S) toggles it per window, so it lives in session storage
// (a reload keeps it; a new window starts with it shown). An external store
// because the AppLayout host and the window band's lead both read it.
const storageKey = 'haus.appSidebar.open';

let sidebarOpen = readInitialOpen();
const listeners = new Set<() => void>();

export function useAppSidebarOpen(): boolean {
    return React.useSyncExternalStore(
        subscribe,
        () => sidebarOpen,
        () => true
    );
}

export function setAppSidebarOpen(next: boolean) {
    if (next === sidebarOpen) {
        return;
    }
    sidebarOpen = next;
    try {
        window.sessionStorage.setItem(storageKey, String(next));
    } catch {
        // Storage can be unavailable; the toggle still works for this page load.
    }
    for (const listener of listeners) {
        listener();
    }
}

/**
 * Wires View > Show/Hide Sidebar for this window: the menu's toggle flips the
 * sidebar, and the window reports the state so the item's label follows it.
 */
export function useDesktopSidebarToggle(): boolean {
    const open = useAppSidebarOpen();
    React.useEffect(() => {
        void getDesktopBridge()?.reportMenuState?.({ sidebarOpen: open });
    }, [open]);
    React.useEffect(
        () => getDesktopBridge()?.onSidebarToggle?.(() => setAppSidebarOpen(!sidebarOpen)),
        []
    );
    return open;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readInitialOpen() {
    try {
        return (
            typeof window === 'undefined' || window.sessionStorage.getItem(storageKey) !== 'false'
        );
    } catch {
        return true;
    }
}
