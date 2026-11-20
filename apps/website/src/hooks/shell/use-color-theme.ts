import * as React from 'react';
import { resolveColorTheme } from '../../lib/appearance-root.ts';
import {
    type ColorTheme,
    colorThemeStorageKey,
    readStoredColorTheme,
    writeStoredColorTheme,
} from '../../lib/color-theme.ts';
import { type ColorThemeDefinition, colorThemeDefinition } from '../../lib/color-themes.ts';
import { useCustomThemes } from './use-custom-themes.ts';

// One per-device choice shared by every consumer in this window, on the web and desktop alike.
let colorTheme: ColorTheme = readStoredColorTheme(safeLocalStorage());
const listeners = new Set<() => void>();

/** The live color theme; a custom theme deleted elsewhere reads as the default. */
export function useColorTheme(): ColorTheme {
    const selection = React.useSyncExternalStore(subscribe, getColorTheme, getColorTheme);
    return resolveColorTheme(selection, useCustomThemes());
}

/** The live theme's definition: what consumers read instead of comparing theme ids. */
export function useColorThemeDefinition(): ColorThemeDefinition {
    return colorThemeDefinition(useColorTheme());
}

/**
 * Mounted once, by `ThemeProvider` at the app root, which stamps the result on
 * the document root: follows picks made in other windows (storage events).
 */
export function useColorThemeSync(): ColorTheme {
    React.useEffect(() => {
        const follow = (event: StorageEvent) => {
            if (event.key === colorThemeStorageKey || event.key === null) {
                selectColorTheme(readStoredColorTheme(safeLocalStorage()), null);
            }
        };
        window.addEventListener('storage', follow);
        return () => window.removeEventListener('storage', follow);
    }, []);
    return useColorTheme();
}

export function getColorTheme(): ColorTheme {
    return colorTheme;
}

/**
 * Applies instantly and persists for this device (`null` storage applies
 * without persisting).
 */
export function selectColorTheme(
    next: ColorTheme,
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    if (next === colorTheme) {
        return;
    }
    colorTheme = next;
    writeStoredColorTheme(storage, next);
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

function safeLocalStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
