import { describe, expect, test } from 'bun:test';
import { colorThemeDefinition, type DayPart } from '../../../lib/color-themes.ts';
import { greetingLine } from './inbox-greeting.ts';

// Local-clock instants, so the buckets read the same in every test timezone.
const at = (hour: number, minute = 0, day = 16) => new Date(2026, 9, day, hour, minute).getTime();

const halloween = colorThemeDefinition('halloween').greetings;
const bucketHours: Record<DayPart, readonly number[]> = {
    afternoon: [12, 14, 17],
    evening: [18, 21, 23],
    morning: [0, 6, 11],
};

describe('greetingLine', () => {
    test('the Default theme keeps the standard greeting', () => {
        expect(colorThemeDefinition('default').greetings).toBeNull();
    });

    test.each([
        [0, 'Good morning, Zach'],
        [11, 'Good morning, Zach'],
        [12, 'Good afternoon, Zach'],
        [17, 'Good afternoon, Zach'],
        [18, 'Good evening, Zach'],
        [23, 'Good evening, Zach'],
    ])('the standard greeting at %i:00 reads %p', (hour, line) => {
        expect(greetingLine(at(hour), 'Zach', null)).toBe(line);
    });

    test('a bucket turns on the hour, not the minute after', () => {
        expect(greetingLine(at(11, 59), 'Zach', null)).toBe('Good morning, Zach');
        expect(greetingLine(at(17, 59), 'Zach', null)).toBe('Good afternoon, Zach');
    });

    test('greets by first name', () => {
        expect(greetingLine(at(9), '  Zach Knickerbocker ', null)).toBe('Good morning, Zach');
    });

    test('a name with a replacement pattern is inserted literally', () => {
        expect(greetingLine(at(9), "$& $'", null)).toBe('Good morning, $&');
    });
});

describe('greetingLine with a theme pool', () => {
    if (!halloween) {
        throw new Error('Halloween defines greeting pools.');
    }
    const pools = halloween;

    test('holds one line through a bucket', () => {
        for (const [part, hours] of Object.entries(bucketHours)) {
            for (let day = 1; day <= 31; day += 1) {
                const lines = new Set(
                    hours.map((hour) => greetingLine(at(hour, 30, day), 'Zach', pools))
                );
                expect({ day, lines: lines.size, part }).toEqual({ day, lines: 1, part });
            }
        }
    });

    test('every pool line is reachable and stays in its bucket', () => {
        for (const [part, hours] of Object.entries(bucketHours) as [DayPart, number[]][]) {
            const expected = pools[part].map((line) => line.replaceAll('{name}', 'Zach'));
            const seen = new Set<string>();
            for (let day = 1; day <= 365; day += 1) {
                const line = greetingLine(
                    new Date(2026, 0, day, hours[1]).getTime(),
                    'Zach',
                    pools
                );
                expect(expected).toContain(line);
                seen.add(line);
            }
            expect([...seen].sort()).toEqual([...expected].sort());
        }
    });

    test('varies from day to day', () => {
        const lines = new Set<string>();
        for (let day = 1; day <= 14; day += 1) {
            lines.add(greetingLine(at(9, 0, day), 'Zach', pools));
        }
        expect(lines.size).toBeGreaterThan(1);
    });

    test('substitutes the first name and leaves no placeholder', () => {
        for (let day = 1; day <= 60; day += 1) {
            for (const hour of [9, 15, 20]) {
                const line = greetingLine(
                    new Date(2026, 0, day, hour).getTime(),
                    'Zach Knickerbocker',
                    pools
                );
                expect(line).not.toContain('{name}');
                expect(line).not.toContain('Knickerbocker');
            }
        }
        expect(pools.afternoon.some((line) => line.includes('{name}'))).toBe(true);
    });
});
