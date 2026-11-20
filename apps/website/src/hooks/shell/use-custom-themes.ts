import * as React from 'react';
import { installCustomThemeStyles } from '../../lib/appearance-root.ts';
import type { CustomThemeId } from '../../lib/color-theme.ts';
import {
    type CustomTheme,
    customThemesStorageKey,
    newCustomThemeId,
    nextCustomThemeName,
    readStoredCustomThemes,
    type ThemeColors,
    writeStoredCustomThemes,
} from '../../lib/custom-themes.ts';

let customThemes: readonly CustomTheme[] = readStoredCustomThemes(safeLocalStorage());
const listeners = new Set<() => void>();

export function useCustomThemes() {
    return React.useSyncExternalStore(subscribe, getCustomThemes, getCustomThemes);
}

export function useCustomTheme(id: CustomThemeId | null) {
    const themes = useCustomThemes();
    return themes.find((theme) => theme.id === id) ?? null;
}

export function getCustomThemes() {
    return customThemes;
}

export function useCustomThemesSync() {
    React.useEffect(() => {
        const follow = (event: StorageEvent) => {
            if (event.key === customThemesStorageKey || event.key === null) {
                saveCustomThemes(readStoredCustomThemes(safeLocalStorage()), null);
            }
        };
        window.addEventListener('storage', follow);
        return () => window.removeEventListener('storage', follow);
    }, []);
}

export function saveCustomThemes(
    next: readonly CustomTheme[],
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    customThemes = next;
    writeStoredCustomThemes(storage, next);
    if (typeof document !== 'undefined') {
        installCustomThemeStyles(document, next);
    }
    for (const listener of listeners) {
        listener();
    }
}

export function createCustomTheme(
    seed: Pick<CustomTheme, 'background'> & { dark: ThemeColors; light: ThemeColors }
) {
    const theme: CustomTheme = {
        ...seed,
        id: newCustomThemeId(),
        name: nextCustomThemeName(customThemes),
    };
    saveCustomThemes([...customThemes, theme]);
    return theme.id;
}

export function updateCustomTheme(id: CustomThemeId, change: (theme: CustomTheme) => CustomTheme) {
    saveCustomThemes(customThemes.map((theme) => (theme.id === id ? change(theme) : theme)));
}

export function deleteCustomTheme(id: CustomThemeId) {
    saveCustomThemes(customThemes.filter((theme) => theme.id !== id));
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function safeLocalStorage() {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
