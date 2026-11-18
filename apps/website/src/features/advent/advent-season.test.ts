import { describe, expect, test } from 'bun:test';
import {
    adventDoors,
    adventSeason,
    allDoorsOpen,
    doorColor,
    doorState,
    isTodayUnopened,
} from './advent-season.ts';
import { parseDebugToday, readLocalToday } from './local-today.ts';

describe('adventSeason', () => {
    test('is off before December and after Twelfth Night', () => {
        expect(adventSeason({ day: 30, month: 11, year: 2026 })).toBeNull();
        expect(adventSeason({ day: 7, month: 1, year: 2027 })).toBeNull();
        expect(adventSeason({ day: 15, month: 7, year: 2026 })).toBeNull();
    });

    test('runs a door a day from Dec 1 to Dec 24', () => {
        expect(adventSeason({ day: 1, month: 12, year: 2026 })).toEqual({ today: 1, year: 2026 });
        expect(adventSeason({ day: 24, month: 12, year: 2026 })).toEqual({ today: 24, year: 2026 });
    });

    test('opens every door from Christmas Day', () => {
        expect(adventSeason({ day: 25, month: 12, year: 2026 })).toEqual({
            today: allDoorsOpen,
            year: 2026,
        });
        expect(adventSeason({ day: 31, month: 12, year: 2026 })?.today).toBe(allDoorsOpen);
    });

    test('keeps last December up through Jan 6', () => {
        expect(adventSeason({ day: 1, month: 1, year: 2027 })).toEqual({
            today: allDoorsOpen,
            year: 2026,
        });
        expect(adventSeason({ day: 6, month: 1, year: 2027 })).toEqual({
            today: allDoorsOpen,
            year: 2026,
        });
    });
});

describe('doorState', () => {
    const none: ReadonlySet<number> = new Set();

    test('past doors are open, today waits to be opened, the rest are locked', () => {
        expect(doorState(3, 12, none)).toBe('past');
        expect(doorState(12, 12, none)).toBe('today-closed');
        expect(doorState(12, 12, new Set([12]))).toBe('today-open');
        expect(doorState(13, 12, none)).toBe('locked');
    });

    test('from Christmas Day every door is past', () => {
        expect(adventDoors.map((day) => doorState(day, allDoorsOpen, none))).toEqual(
            adventDoors.map(() => 'past')
        );
    });

    test("the chip's dot shows only while today's door is shut", () => {
        expect(isTodayUnopened({ today: 5, year: 2026 }, none)).toBe(true);
        expect(isTodayUnopened({ today: 5, year: 2026 }, new Set([5]))).toBe(false);
        expect(isTodayUnopened({ today: allDoorsOpen, year: 2026 }, none)).toBe(false);
    });

    test('doors run red, green and gold in turn', () => {
        expect([1, 2, 3, 4, 24].map(doorColor)).toEqual(['red', 'green', 'gold', 'red', 'gold']);
    });
});

describe('local today', () => {
    test('reads the local calendar date', () => {
        expect(readLocalToday(new Date(2026, 10, 2, 23, 59), null)).toEqual({
            day: 2,
            month: 11,
            year: 2026,
        });
    });

    test('a valid debug date stands in for today', () => {
        expect(readLocalToday(new Date(2026, 10, 2), '2026-12-12')).toEqual({
            day: 12,
            month: 12,
            year: 2026,
        });
    });

    test('a malformed or impossible debug date is ignored', () => {
        for (const value of ['2026-12-32', '2026-02-30', '12/12/2026', 'tomorrow', '']) {
            expect(parseDebugToday(value)).toBeNull();
        }
        expect(parseDebugToday(null)).toBeNull();
    });
});
