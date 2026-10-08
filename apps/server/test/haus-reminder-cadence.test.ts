import { describe, expect, test } from 'bun:test';
import {
    nextReminderFireAt,
    parseReminderRepeat,
    parseReminderSnooze,
} from '../src/reminders/cadence.ts';
import { alignUpdateToCadence, resolveScheduleTiming } from '../src/reminders/schedule-timing.ts';

describe('reminder cadence', () => {
    test('accepts only the reminder grammar', () => {
        expect(parseReminderRepeat('every:15m')).toEqual({
            intervalMs: 900_000,
            kind: 'every',
            spec: 'every:15m',
        });
        expect(parseReminderRepeat('daily@09:00')).toEqual({
            hour: 9,
            kind: 'daily',
            minute: 0,
            spec: 'daily@09:00',
        });
        expect(parseReminderRepeat('weekly:fri,mon,fri@09:30')).toEqual({
            days: [1, 5],
            hour: 9,
            kind: 'weekly',
            minute: 30,
            spec: 'weekly:mon,fri@09:30',
        });

        for (const invalid of [
            'every:0m',
            'every:99999999999d',
            'daily@25:00',
            'weekly:weekday@09:00',
            '0 9 * * *',
            '',
        ]) {
            expect(parseReminderRepeat(invalid), invalid).toBeNull();
        }
        expect(parseReminderSnooze('30m')).toBe(1_800_000);
        expect(parseReminderSnooze('soon')).toBeNull();
    });

    test('keeps wall-clock cadence through DST without double firing', () => {
        const beforeSpringForward = Date.UTC(2026, 2, 8, 4, 30);
        const spring = parseReminderRepeat('daily@02:30');
        expect(spring).not.toBeNull();
        expect(nextReminderFireAt(spring!, beforeSpringForward, 'America/New_York')).toBe(
            Date.UTC(2026, 2, 8, 7, 30)
        );

        const beforeFallBack = Date.UTC(2026, 10, 1, 3, 30);
        const fall = parseReminderRepeat('daily@01:30');
        expect(fall).not.toBeNull();
        const first = nextReminderFireAt(fall!, beforeFallBack, 'America/New_York');
        expect(first).toBe(Date.UTC(2026, 10, 1, 5, 30));
        expect(nextReminderFireAt(fall!, first, 'America/New_York')).toBe(
            Date.UTC(2026, 10, 2, 6, 30)
        );
    });

    // Production: weekly:mon@15:57 was meant as 3:57 PM Eastern. The first fire
    // (19:57Z) was right; every later fire snapped to 15:57 in the stored zone.
    test('derives a calendar first fire from its cadence and zone', () => {
        const weekly = parseReminderRepeat('weekly:mon@15:57');
        const now = new Date('2026-10-08T12:00:00.000Z');
        expect(
            resolveScheduleTiming({ timezone: 'America/New_York' }, weekly, {
                homeTimezone: 'UTC',
                now,
            })
        ).toEqual({ fireAt: new Date('2026-10-12T19:57:00.000Z'), timezone: 'America/New_York' });
    });

    test('refuses an off-slot calendar first fire and names the next slot', () => {
        const weekly = parseReminderRepeat('weekly:mon@15:57');
        const context = { homeTimezone: 'UTC', now: new Date('2026-10-08T12:00:00.000Z') };
        // The production request: 3:57 PM Eastern, but a UTC cadence.
        expect(() =>
            resolveScheduleTiming(
                { fireAt: new Date('2026-10-12T19:57:00.000Z'), timezone: 'UTC' },
                weekly,
                context
            )
        ).toThrow(
            'The first fire 2026-10-12T19:57:00.000Z is not a weekly:mon@15:57 slot in UTC. Omit the fire time to start at the next slot, or use a slot such as 2026-10-19T15:57:00.000Z.'
        );
        expect(
            resolveScheduleTiming(
                { fireAt: new Date('2026-10-12T19:57:00.000Z'), timezone: 'America/New_York' },
                weekly,
                context
            ).fireAt
        ).toEqual(new Date('2026-10-12T19:57:00.000Z'));
    });

    test('calendar repeats name their zone; one-shots and intervals keep an explicit instant', () => {
        const context = { homeTimezone: 'UTC', now: new Date('2026-10-08T12:00:00.000Z') };
        expect(() =>
            resolveScheduleTiming({}, parseReminderRepeat('daily@09:00'), context)
        ).toThrow('needs an explicit IANA timezone');
        expect(() =>
            resolveScheduleTiming(
                { timezone: 'Mars/Olympus' },
                parseReminderRepeat('daily@09:00'),
                context
            )
        ).toThrow('valid IANA timezone');
        expect(() => resolveScheduleTiming({}, null, context)).toThrow('Provide fireAt');
        expect(() => resolveScheduleTiming({}, parseReminderRepeat('every:1h'), context)).toThrow(
            'Provide fireAt'
        );
        const offSlot = new Date('2026-10-08T12:34:56.000Z');
        expect(
            resolveScheduleTiming({ fireAt: offSlot }, parseReminderRepeat('every:1h'), context)
        ).toEqual({ fireAt: offSlot, timezone: 'UTC' });
    });

    test('updates keep a calendar reminder on its cadence', () => {
        const now = new Date('2026-10-08T12:00:00.000Z');
        const reminder = { repeat: 'weekly:mon@15:57', timezone: 'America/New_York' };
        expect(alignUpdateToCadence({ repeat: 'daily@08:00' }, reminder, now)).toEqual({
            fireAt: new Date('2026-10-09T12:00:00.000Z'),
            repeat: 'daily@08:00',
        });
        expect(alignUpdateToCadence({ repeat: 'every:2h' }, reminder, now)).toEqual({
            repeat: 'every:2h',
        });
        expect(() =>
            alignUpdateToCadence({ fireAt: new Date('2026-10-12T15:57:00.000Z') }, reminder, now)
        ).toThrow('is not a weekly:mon@15:57 slot in America/New_York');
        const slot = { fireAt: new Date('2026-10-19T19:57:00.000Z') };
        expect(alignUpdateToCadence(slot, reminder, now)).toEqual(slot);
        const oneShot = { fireAt: new Date('2026-10-08T12:34:00.000Z') };
        expect(alignUpdateToCadence(oneShot, { repeat: null, timezone: 'UTC' }, now)).toEqual(
            oneShot
        );
    });
});
