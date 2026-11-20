/**
 * The color theme (.design/guidelines.md "Color themes"): a palette family layered over
 * the Light/Dark/System mode, picked in Settings > Appearance. Stamped as
 * `data-color-theme` on the document root, where token and decoration layers
 * under `styles/themes/` key off it. App-local presentation: persisted per
 * device, never synced. A preset is one definition in `color-themes.ts`; a
 * custom theme is one record in `custom-themes.ts`, keyed `custom-<id>`.
 */
const presetThemeIds = [
    'default',
    'oled',
    'catppuccin',
    'gruvbox',
    'everforest',
    'nord',
    'one',
    'mauve',
    'halloween',
    'christmas-eve',
    'christmas-morning',
] as const;

export type PresetTheme = (typeof presetThemeIds)[number];

export type CustomThemeId = `custom-${string}`;

export type ColorTheme = PresetTheme | CustomThemeId;

export const defaultColorTheme: ColorTheme = 'default';

export const colorThemeStorageKey = 'haus.color-theme';

const customThemeIdPattern = /^custom-[a-z0-9]{1,32}$/u;

export function parseColorTheme(value: unknown): ColorTheme | null {
    return parsePresetTheme(value) ?? parseCustomThemeId(value);
}

export function parsePresetTheme(value: unknown): PresetTheme | null {
    return presetThemeIds.find((id) => id === value) ?? null;
}

export function parseCustomThemeId(value: unknown): CustomThemeId | null {
    return typeof value === 'string' && customThemeIdPattern.test(value)
        ? (value as CustomThemeId)
        : null;
}

export function isCustomTheme(theme: ColorTheme): theme is CustomThemeId {
    return parseCustomThemeId(theme) !== null;
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
