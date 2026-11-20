import * as React from 'react';
import { pruneBackgroundImages } from '../../lib/background-images.ts';
import { type ColorTheme, isCustomTheme } from '../../lib/color-theme.ts';
import type { ThemeBackground } from '../../lib/home-background.ts';
import {
    type PresetBackgrounds,
    presetBackground,
    presetBackgroundsStorageKey,
    readStoredPresetBackgrounds,
    writeStoredPresetBackgrounds,
} from '../../lib/preset-backgrounds.ts';
import { useColorTheme } from './use-color-theme.ts';
import { getCustomThemes, updateCustomTheme, useCustomThemes } from './use-custom-themes.ts';

let presetBackgrounds: PresetBackgrounds = readStoredPresetBackgrounds(safeLocalStorage());
let preview: { readonly background: ThemeBackground; readonly theme: ColorTheme } | null = null;
const listeners = new Set<() => void>();

export function useActiveThemeBackground() {
    return useThemeBackground(useColorTheme());
}

export function useThemeBackground(theme: ColorTheme) {
    const overrides = React.useSyncExternalStore(
        subscribe,
        getPresetBackgrounds,
        getPresetBackgrounds
    );
    const live = React.useSyncExternalStore(subscribe, getPreview, getPreview);
    const customThemes = useCustomThemes();
    return live?.theme === theme
        ? live.background
        : resolveBackground(theme, overrides, customThemes);
}

export function getThemeBackground(theme: ColorTheme) {
    return resolveBackground(theme, presetBackgrounds, getCustomThemes());
}

export function getPresetBackgrounds() {
    return presetBackgrounds;
}

export function usePresetBackgroundsSync() {
    React.useEffect(() => {
        const follow = (event: StorageEvent) => {
            if (event.key === presetBackgroundsStorageKey || event.key === null) {
                publish(readStoredPresetBackgrounds(safeLocalStorage()), null);
            }
        };
        window.addEventListener('storage', follow);
        return () => window.removeEventListener('storage', follow);
    }, []);
}

export function previewThemeBackground(theme: ColorTheme, background: ThemeBackground) {
    preview = { background, theme };
    notify();
}

export function saveThemeBackground(theme: ColorTheme, background: ThemeBackground) {
    preview = null;
    if (isCustomTheme(theme)) {
        updateCustomTheme(theme, (current) => ({ ...current, background }));
        notify();
    } else {
        publish({ ...presetBackgrounds, [theme]: background });
    }
}

export function pruneUnusedBackgroundImages() {
    const kept = [
        ...Object.values(presetBackgrounds),
        ...getCustomThemes().map((theme) => theme.background),
    ].flatMap((background) => (background?.image ? [background.image.id] : []));
    return pruneBackgroundImages(new Set(kept));
}

function resolveBackground(
    theme: ColorTheme,
    overrides: PresetBackgrounds,
    customThemes: ReturnType<typeof getCustomThemes>
) {
    if (!isCustomTheme(theme)) {
        return presetBackground(theme, overrides);
    }
    const custom = customThemes.find((entry) => entry.id === theme);
    return custom?.background ?? presetBackground('default', overrides);
}

function publish(
    next: PresetBackgrounds,
    storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
) {
    presetBackgrounds = next;
    writeStoredPresetBackgrounds(storage, next);
    notify();
}

function getPreview() {
    return preview;
}

function notify() {
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

function safeLocalStorage() {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
