import { describe, expect, test } from 'bun:test';
import {
    parseShellVariant,
    readStoredShellVariant,
    shellVariantStorageKey,
    writeStoredShellVariant,
} from '../../lib/shell-variant.ts';
import { getShellVariant, selectShellVariant } from './use-shell-variant.ts';

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

describe('window layout', () => {
    test('parses only Canvas and Band', () => {
        expect(parseShellVariant('canvas')).toBe('canvas');
        expect(parseShellVariant('band')).toBe('band');
        expect(parseShellVariant('current')).toBeNull();
        expect(parseShellVariant('Canvas')).toBeNull();
        expect(parseShellVariant(null)).toBeNull();
    });

    test('missing, retired classic, unknown, or unreadable storage reads as Band', () => {
        expect(readStoredShellVariant(null)).toBe('band');
        expect(readStoredShellVariant(memoryStorage())).toBe('band');
        expect(readStoredShellVariant(memoryStorage({ [shellVariantStorageKey]: 'current' }))).toBe(
            'band'
        );
        expect(readStoredShellVariant(memoryStorage({ [shellVariantStorageKey]: 'wide' }))).toBe(
            'band'
        );
        expect(readStoredShellVariant(throwingStorage)).toBe('band');
        expect(readStoredShellVariant(memoryStorage({ [shellVariantStorageKey]: 'canvas' }))).toBe(
            'canvas'
        );
    });

    test('persists the pick, and blocked storage does not throw', () => {
        const storage = memoryStorage();
        writeStoredShellVariant(storage, 'canvas');
        expect(storage.values.get(shellVariantStorageKey)).toBe('canvas');
        expect(() => writeStoredShellVariant(throwingStorage, 'band')).not.toThrow();
    });

    test('the web reads no layout; a pick applies live and persists', () => {
        expect(getShellVariant()).toBeNull();
        const storage = memoryStorage();
        selectShellVariant('canvas', storage);
        expect(getShellVariant()).toBe('canvas');
        expect(storage.values.get(shellVariantStorageKey)).toBe('canvas');
        selectShellVariant('band', throwingStorage);
        expect(getShellVariant()).toBe('band');
    });
});
