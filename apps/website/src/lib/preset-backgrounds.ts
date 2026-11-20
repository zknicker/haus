import { type PresetTheme, parsePresetTheme } from './color-theme.ts';
import { colorThemeDefinition } from './color-themes.ts';
import { parseThemeBackground, type ThemeBackground, themeBackground } from './home-background.ts';

export type PresetBackgrounds = Readonly<Partial<Record<PresetTheme, ThemeBackground>>>;

export const presetBackgroundsStorageKey = 'haus.preset-backgrounds';

export function presetBackground(theme: PresetTheme, overrides: PresetBackgrounds) {
    return overrides[theme] ?? themeBackground(colorThemeDefinition(theme).background);
}

export function parsePresetBackgrounds(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) => {
            const theme = parsePresetTheme(key);
            const background = parseThemeBackground(entry);
            return theme && background ? [[theme, background]] : [];
        })
    ) as PresetBackgrounds;
}

export function readStoredPresetBackgrounds(storage: Pick<Storage, 'getItem'> | null) {
    try {
        const raw = storage?.getItem(presetBackgroundsStorageKey);
        return raw ? parsePresetBackgrounds(JSON.parse(raw)) : {};
    } catch {
        return {};
    }
}

export function writeStoredPresetBackgrounds(
    storage: Pick<Storage, 'setItem'> | null,
    overrides: PresetBackgrounds
) {
    try {
        storage?.setItem(presetBackgroundsStorageKey, JSON.stringify(overrides));
    } catch {
        return;
    }
}
