import { describe, expect, test } from 'bun:test';
import { resolveColorTheme } from './appearance-root.ts';
import { parseColorTheme } from './color-theme.ts';
import {
    customThemeCss,
    customThemesStorageKey,
    type HexColor,
    newCustomThemeId,
    nextCustomThemeName,
    parseCustomThemes,
    parseHexColor,
    readStoredCustomThemes,
    withThemeColor,
    writeStoredCustomThemes,
} from './custom-themes.ts';

const light = { accent: '#3b5de8', background: '#f2f2f4', foreground: '#1e1e20' };
const dark = { accent: '#7c93ff', background: '#101012', foreground: '#ededf0', card: '#1c1c20' };
const stored = { dark, id: 'custom-abc123', light, name: 'Classic' };

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        values,
    };
}

describe('custom themes', () => {
    test('hex colors normalize to lowercase #rrggbb and nothing else parses', () => {
        expect(parseHexColor(' #3B5DE8 ')).toBe('#3b5de8' as HexColor);
        expect(parseHexColor('#3b5')).toBeNull();
        expect(parseHexColor('rgb(0, 0, 0)')).toBeNull();
        expect(parseHexColor(12)).toBeNull();
    });

    test('a stored list keeps valid themes and drops broken ones and bad advanced colors', () => {
        const themes = parseCustomThemes([
            stored,
            { ...stored, id: 'custom-def456', light: { ...light, card: 'blue' } },
            { ...stored, id: 'nord' },
            { ...stored, id: 'custom-zzz', light: { accent: '#000000' } },
            { ...stored, id: 'custom-blank', name: '   ' },
            'junk',
        ]);
        expect(themes.map((theme) => theme.id)).toEqual(['custom-abc123', 'custom-def456']);
        expect(themes[0]).toEqual(stored as never);
        expect(themes[1]?.light).toEqual(light as never);
        expect(parseCustomThemes({ themes: [] })).toEqual([]);
    });

    test('round-trips through storage, and unreadable storage reads as none', () => {
        const storage = memoryStorage();
        const themes = parseCustomThemes([stored]);
        writeStoredCustomThemes(storage, themes);
        expect(readStoredCustomThemes(storage)).toEqual(themes);
        expect(readStoredCustomThemes(memoryStorage({ [customThemesStorageKey]: '{' }))).toEqual(
            []
        );
        expect(readStoredCustomThemes(null)).toEqual([]);
    });

    test('writes each mode as one token block keyed by the theme, the mode and the palette', () => {
        expect(customThemeCss(parseCustomThemes([stored]))).toBe(
            [
                '[data-color-theme="custom-abc123"][data-palette][data-theme="light"] { --accent: #3b5de8; --background: #f2f2f4; --foreground: #1e1e20; }',
                '[data-color-theme="custom-abc123"][data-palette][data-theme="dark"] { --accent: #7c93ff; --background: #101012; --foreground: #ededf0; --surface: #1c1c20; }',
            ].join('\n')
        );
        expect(customThemeCss([])).toBe('');
    });

    test('setting a color overrides it; clearing an advanced color hands it back to derivation', () => {
        const colors = parseCustomThemes([stored])[0]?.dark;
        if (!colors) {
            throw new Error('fixture theme did not parse');
        }
        expect(withThemeColor(colors, 'muted', '#888888' as HexColor)).toEqual({
            ...dark,
            muted: '#888888',
        } as never);
        expect(withThemeColor(colors, 'card', null)).toEqual({
            accent: dark.accent,
            background: dark.background,
            foreground: dark.foreground,
        } as never);
        expect(withThemeColor(colors, 'accent', null)).toBe(colors);
    });

    test('new themes get a parseable id and the next free name', () => {
        expect(newCustomThemeId(() => 0.5)).toBe('custom-i0000000' as never);
        expect(parseColorTheme(newCustomThemeId())).not.toBeNull();
        const themes = parseCustomThemes([stored]);
        expect(nextCustomThemeName(themes)).toBe('Custom');
        expect(nextCustomThemeName([...themes, { ...themes[0], name: 'Custom' } as never])).toBe(
            'Custom 2'
        );
    });

    test('a selected custom theme that no longer exists resolves to Haus', () => {
        const themes = parseCustomThemes([stored]);
        expect(resolveColorTheme('custom-abc123', themes)).toBe('custom-abc123');
        expect(resolveColorTheme('custom-gone', themes)).toBe('default');
        expect(resolveColorTheme('nord', [])).toBe('nord');
    });
});
