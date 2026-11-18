import { describe, expect, test } from 'bun:test';
import {
    defaultRooflineSnow,
    parseRooflineSnow,
    readStoredRooflineSnow,
    rooflineSnowStorageKey,
    rooflineSnows,
    writeStoredRooflineSnow,
} from './roofline-snow.ts';

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

describe('roofline snow', () => {
    test('offers Puffy, Soft, and Icicles, in that order, defaulting to Puffy', () => {
        expect(rooflineSnows.map((snow) => [snow.id, snow.label])).toEqual([
            ['puffy', 'Puffy'],
            ['soft', 'Soft'],
            ['icicles', 'Icicles'],
        ]);
        expect(defaultRooflineSnow).toBe('puffy');
    });

    test('parses only the offered snows', () => {
        for (const { id } of rooflineSnows) {
            expect(parseRooflineSnow(id)).toBe(id);
        }
        expect(parseRooflineSnow('Puffy')).toBeNull();
        expect(parseRooflineSnow('blizzard')).toBeNull();
        expect(parseRooflineSnow(null)).toBeNull();
        expect(parseRooflineSnow(1)).toBeNull();
    });

    test('missing, unknown, or unreadable storage reads as Puffy', () => {
        expect(readStoredRooflineSnow(null)).toBe('puffy');
        expect(readStoredRooflineSnow(memoryStorage())).toBe('puffy');
        expect(
            readStoredRooflineSnow(memoryStorage({ [rooflineSnowStorageKey]: 'blizzard' }))
        ).toBe('puffy');
        expect(readStoredRooflineSnow(throwingStorage)).toBe('puffy');
        expect(readStoredRooflineSnow(memoryStorage({ [rooflineSnowStorageKey]: 'icicles' }))).toBe(
            'icicles'
        );
    });

    test('persists the pick, and blocked or missing storage does not throw', () => {
        const storage = memoryStorage();
        writeStoredRooflineSnow(storage, 'soft');
        expect(storage.values.get(rooflineSnowStorageKey)).toBe('soft');
        expect(() => writeStoredRooflineSnow(throwingStorage, 'icicles')).not.toThrow();
        expect(() => writeStoredRooflineSnow(null, 'icicles')).not.toThrow();
    });
});
