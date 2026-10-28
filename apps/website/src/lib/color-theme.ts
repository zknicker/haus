/**
 * The color theme (.design/guidelines.md "Color themes"): a palette family layered over
 * the Light/Dark/System mode, picked in Settings > Preferences. Stamped as
 * `data-color-theme` on the document root, where token and decoration layers
 * under `styles/themes/` key off it. App-local presentation: persisted per
 * device, never synced. What each theme changes lives in its definition
 * (`color-themes.ts`).
 */
const colorThemeIds = ['default', 'halloween'] as const;

export type ColorTheme = (typeof colorThemeIds)[number];

export const defaultColorTheme: ColorTheme = 'default';

export const colorThemeStorageKey = 'haus.color-theme';

export function parseColorTheme(value: unknown): ColorTheme | null {
    return colorThemeIds.find((id) => id === value) ?? null;
}

/** The persisted theme. Missing, unknown, or unreadable values all read as the default. */
export function readStoredColorTheme(storage: Pick<Storage, 'getItem'> | null): ColorTheme {
    try {
        return parseColorTheme(storage?.getItem(colorThemeStorageKey)) ?? defaultColorTheme;
    } catch {
        return defaultColorTheme;
    }
}

/** Persists the theme; a blocked storage keeps the in-memory choice for this session. */
export function writeStoredColorTheme(storage: Pick<Storage, 'setItem'> | null, theme: ColorTheme) {
    try {
        storage?.setItem(colorThemeStorageKey, theme);
    } catch {
        // Presentation preference only; the live choice still applies.
    }
}
