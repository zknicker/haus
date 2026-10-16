import { describe, expect, test } from 'bun:test';
import {
    colorThemeStorageKey,
    parseColorTheme,
    readStoredColorTheme,
    writeStoredColorTheme,
} from '../../lib/color-theme.ts';
import { getColorTheme, selectColorTheme } from './use-color-theme.ts';

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

const throwingStorage = {
    getItem: (): string | null => {
        throw new Error('blocked');
    },
    setItem: () => {
        throw new Error('blocked');
    },
};

describe('color theme', () => {
    test('parses only Default and Halloween', () => {
        expect(parseColorTheme('default')).toBe('default');
        expect(parseColorTheme('halloween')).toBe('halloween');
        expect(parseColorTheme('Halloween')).toBeNull();
        expect(parseColorTheme('dark')).toBeNull();
        expect(parseColorTheme(null)).toBeNull();
    });

    test('missing, unknown, or unreadable storage reads as Default', () => {
        expect(readStoredColorTheme(null)).toBe('default');
        expect(readStoredColorTheme(memoryStorage())).toBe('default');
        expect(readStoredColorTheme(memoryStorage({ [colorThemeStorageKey]: 'xmas' }))).toBe(
            'default'
        );
        expect(readStoredColorTheme(throwingStorage)).toBe('default');
        expect(readStoredColorTheme(memoryStorage({ [colorThemeStorageKey]: 'halloween' }))).toBe(
            'halloween'
        );
    });

    test('persists the pick, and blocked storage does not throw', () => {
        const storage = memoryStorage();
        writeStoredColorTheme(storage, 'halloween');
        expect(storage.values.get(colorThemeStorageKey)).toBe('halloween');
        expect(() => writeStoredColorTheme(throwingStorage, 'default')).not.toThrow();
    });

    test('a pick applies live and persists', () => {
        expect(getColorTheme()).toBe('default');
        const storage = memoryStorage();
        selectColorTheme('halloween', storage);
        expect(getColorTheme()).toBe('halloween');
        expect(storage.values.get(colorThemeStorageKey)).toBe('halloween');
        selectColorTheme('default', throwingStorage);
        expect(getColorTheme()).toBe('default');
    });
});
