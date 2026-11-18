import { describe, expect, test } from 'bun:test';
import {
    AdventDoorLockedError,
    AdventTimeZoneError,
    latestOpenDay,
    openDoors,
    requireIanaTimeZone,
} from './season.ts';

describe('latestOpenDay', () => {
    test('no doors before Dec 1 reaches UTC+14', () => {
        expect(latestOpenDay(2026, new Date('2026-11-02T12:00:00Z'))).toBe(0);
        // 09:59Z on Nov 30 is still Nov 30 at UTC+14.
        expect(latestOpenDay(2026, new Date('2026-11-30T09:59:59Z'))).toBe(0);
    });

    test('Dec 1 opens as soon as UTC+14 reaches it', () => {
        expect(latestOpenDay(2026, new Date('2026-11-30T10:00:00Z'))).toBe(1);
    });

    test('during December the limit is the UTC+14 date', () => {
        expect(latestOpenDay(2026, new Date('2026-12-10T09:00:00Z'))).toBe(10);
        expect(latestOpenDay(2026, new Date('2026-12-10T11:00:00Z'))).toBe(11);
    });

    test('Dec 25 and later open every door', () => {
        expect(latestOpenDay(2026, new Date('2026-12-24T10:00:00Z'))).toBe(25);
        expect(latestOpenDay(2026, new Date('2026-12-31T00:00:00Z'))).toBe(25);
    });

    test('a past year is all doors; a future year is none', () => {
        expect(latestOpenDay(2025, new Date('2026-03-01T00:00:00Z'))).toBe(25);
        // New Year's Eve at UTC+14 already counts as next year's past.
        expect(latestOpenDay(2026, new Date('2026-12-31T10:00:00Z'))).toBe(25);
        expect(latestOpenDay(2027, new Date('2026-12-31T09:00:00Z'))).toBe(0);
    });
});

describe('openDoors', () => {
    const midSeason = new Date('2026-12-10T12:00:00Z');

    test('returns days 1 through throughDay', () => {
        expect(openDoors({ throughDay: 3, year: 2026 }, midSeason)).toEqual([1, 2, 3]);
    });

    test('refuses a day no place on Earth has reached', () => {
        expect(() => openDoors({ throughDay: 12, year: 2026 }, midSeason)).toThrow(
            AdventDoorLockedError
        );
        expect(() =>
            openDoors({ throughDay: 1, year: 2026 }, new Date('2026-11-02T00:00:00Z'))
        ).toThrow(AdventDoorLockedError);
    });

    test('throughDay 25 still stops at the 24th door', () => {
        const doors = openDoors({ throughDay: 25, year: 2025 }, midSeason);
        expect(doors).toHaveLength(24);
        expect(doors.at(-1)).toBe(24);
    });
});

describe('requireIanaTimeZone', () => {
    test('accepts named IANA zones and UTC', () => {
        expect(requireIanaTimeZone('America/New_York')).toBe('America/New_York');
        expect(requireIanaTimeZone('America/Argentina/Buenos_Aires')).toBe(
            'America/Argentina/Buenos_Aires'
        );
        expect(requireIanaTimeZone('Etc/GMT+5')).toBe('Etc/GMT+5');
        expect(requireIanaTimeZone('UTC')).toBe('UTC');
    });

    test('refuses offsets, abbreviations, and unknown names', () => {
        for (const zone of ['+05:00', 'EST', 'Mars/Olympus_Mons', 'America/', '']) {
            expect(() => requireIanaTimeZone(zone)).toThrow(AdventTimeZoneError);
        }
    });
});
