import * as React from 'react';

export const capyShellStorageKey = 'haus.capy-shell';

let capyShell = readCapyShell(safeLocalStorage());
const listeners = new Set<() => void>();

export function useCapyShell() {
    return React.useSyncExternalStore(subscribe, getCapyShell, getCapyShell);
}

export function getCapyShell() {
    return capyShell;
}

export function setCapyShell(
    next: boolean,
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    if (next === capyShell) {
        return;
    }
    capyShell = next;
    persistCapyShell(storage, next);
    for (const listener of listeners) {
        listener();
    }
}

export function readCapyShell(storage: Pick<Storage, 'getItem'> | null) {
    try {
        return storage?.getItem(capyShellStorageKey) !== 'off';
    } catch {
        return true;
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        capyShell = readCapyShell(safeLocalStorage());
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
    if (event.key === capyShellStorageKey || event.key === null) {
        setCapyShell(readCapyShell(safeLocalStorage()), null);
    }
}

function persistCapyShell(storage: Pick<Storage, 'setItem'> | null, next: boolean) {
    try {
        storage?.setItem(capyShellStorageKey, next ? 'on' : 'off');
        return true;
    } catch {
        return false;
    }
}

function safeLocalStorage() {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
