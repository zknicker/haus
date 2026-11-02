import { describe, expect, test } from 'bun:test';
import {
    openAdventDay,
    openedDaysKey,
    parseOpenedDays,
    serializeOpenedDays,
} from './use-opened-days.ts';

function memoryStorage() {
    const items = new Map<string, string>();
    return {
        getItem: (key: string) => items.get(key) ?? null,
        items,
        setItem: (key: string, value: string) => {
            items.set(key, value);
        },
    };
}

describe('opened days', () => {
    test('keys by Server and year', () => {
        expect(openedDaysKey('srv_1', 2026)).toBe('haus.advent-opened:srv_1:2026');
        expect(openedDaysKey('srv_1', 2026)).not.toBe(openedDaysKey('srv_2', 2026));
        expect(openedDaysKey('srv_1', 2026)).not.toBe(openedDaysKey('srv_1', 2027));
    });

    test('parses only valid door numbers and treats junk as none opened', () => {
        expect([...parseOpenedDays('[1,3,24]')]).toEqual([1, 3, 24]);
        expect([...parseOpenedDays('[0,25,2.5,"4",5]')]).toEqual([5]);
        expect(parseOpenedDays('{"a":1}').size).toBe(0);
        expect(parseOpenedDays('not json').size).toBe(0);
        expect(parseOpenedDays(null).size).toBe(0);
    });

    test('serializes in door order', () => {
        expect(serializeOpenedDays(new Set([12, 1, 5]))).toBe('[1,5,12]');
    });

    test('opening a door persists it once', () => {
        const storage = memoryStorage();
        openAdventDay('srv_open', 2026, 3, storage);
        openAdventDay('srv_open', 2026, 7, storage);
        openAdventDay('srv_open', 2026, 3, storage);

        expect(storage.items.get(openedDaysKey('srv_open', 2026))).toBe('[3,7]');
    });

    test("opening one Server's door leaves another's alone", () => {
        const storage = memoryStorage();
        openAdventDay('srv_a', 2026, 4, storage);

        expect(storage.items.has(openedDaysKey('srv_b', 2026))).toBe(false);
    });
});
