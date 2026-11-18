import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    readStoredShellVariant,
    type ShellVariant,
    shellVariantStorageKey,
    writeStoredShellVariant,
} from '../../lib/shell-variant.ts';

// One per-device choice shared by every consumer in this window. The web has
// no window layout, so it reads null there.
let shellVariant: ShellVariant | null = desktopShell()
    ? readStoredShellVariant(safeLocalStorage())
    : null;
const listeners = new Set<() => void>();

/** The live window layout; null on the web, which has no window band. */
export function useShellVariant(): ShellVariant | null {
    return React.useSyncExternalStore(subscribe, getShellVariant, () => null);
}

/**
 * Mount once in the server shell: stamps `data-shell-variant` on the document
 * root for the theme layer and follows picks made in other windows (storage
 * events).
 */
export function useShellVariantSync(): ShellVariant | null {
    const variant = useShellVariant();
    React.useEffect(() => {
        if (!desktopShell()) {
            return;
        }
        const follow = (event: StorageEvent) => {
            if (event.key === shellVariantStorageKey || event.key === null) {
                selectShellVariant(readStoredShellVariant(safeLocalStorage()), null);
            }
        };
        window.addEventListener('storage', follow);
        return () => window.removeEventListener('storage', follow);
    }, []);
    // Layout effect: the theme keys off this attribute, so it lands before the first paint.
    React.useLayoutEffect(() => {
        if (!variant) {
            return;
        }
        const root = document.documentElement;
        root.dataset.shellVariant = variant;
        return () => {
            delete root.dataset.shellVariant;
        };
    }, [variant]);
    return variant;
}

export function getShellVariant(): ShellVariant | null {
    return shellVariant;
}

/**
 * Applies instantly and persists for this device (`null` storage applies
 * without persisting). Only the desktop Settings row calls it.
 */
export function selectShellVariant(
    next: ShellVariant,
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    if (next === shellVariant) {
        return;
    }
    shellVariant = next;
    writeStoredShellVariant(storage, next);
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** The desktop shell is the one that hosts workspace tabs, and so the window band. */
function desktopShell() {
    return Boolean(getDesktopBridge()?.browserCommand);
}

function safeLocalStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
