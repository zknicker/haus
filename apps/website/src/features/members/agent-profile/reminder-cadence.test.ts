import { expect, test } from 'bun:test';
import { formatReminderCadence, formatViewerCadence } from './reminder-cadence.ts';

const newYork = { fireAt: '2026-10-09T13:00:00.000Z', timezone: 'America/New_York' };

test('a calendar slot reads in the viewer zone, keeping the promised clock for a same-zone viewer', () => {
    expect(formatViewerCadence('weekly:fri@09:00', newYork, 'America/New_York', 'en-US')).toBe(
        'Every Friday at 9:00 AM'
    );
    expect(formatViewerCadence('daily@09:00', newYork, 'America/Los_Angeles', 'en-US')).toBe(
        'Daily at 6:00 AM'
    );
});

test('a slot that lands on another calendar day for the viewer moves its weekdays too', () => {
    const evening = { fireAt: '2026-10-10T01:00:00.000Z', timezone: 'America/New_York' };
    expect(formatViewerCadence('weekly:fri@21:00', evening, 'Asia/Tokyo', 'en-US')).toBe(
        'Every Saturday at 10:00 AM'
    );
    expect(formatViewerCadence('weekly:sat,mon@21:00', evening, 'Asia/Tokyo', 'en-US')).toBe(
        'Every Sun and Tue at 10:00 AM'
    );
});

test('DST is resolved on the date of the next fire', () => {
    for (const [fireAt, local] of [
        ['2026-03-02T14:00:00.000Z', '2:00 PM'],
        ['2026-03-09T13:00:00.000Z', '1:00 PM'],
        ['2026-10-26T13:00:00.000Z', '1:00 PM'],
        ['2026-11-02T14:00:00.000Z', '2:00 PM'],
    ]) {
        expect(
            formatViewerCadence(
                'weekly:mon@09:00',
                { fireAt: fireAt ?? '', timezone: 'America/New_York' },
                'Europe/London',
                'en-US'
            )
        ).toBe(`Every Monday at ${local}`);
    }
});

test('multiple weekdays use calendar order and locale weekday names', () => {
    expect(
        formatViewerCadence('weekly:fri,mon,wed@09:00', newYork, 'America/New_York', 'en-US')
    ).toBe('Every Mon, Wed, and Fri at 9:00 AM');
    expect(
        formatViewerCadence('weekly:mon@09:00', { ...newYork, timezone: 'UTC' }, 'UTC', 'de-DE')
    ).toBe('Every Montag at 9:00');
});

test('fixed intervals never imply a daily wall-clock appointment', () => {
    expect(formatViewerCadence('every:24h', newYork, 'Asia/Tokyo', 'en-US')).toBe('Every 24 hours');
    expect(formatReminderCadence('every:1d')).toBe('Every 1 day');
    expect(formatReminderCadence('every:15m')).toBe('Every 15 minutes');
});

test('an unknown schedule zone leaves the slot as written', () => {
    expect(
        formatViewerCadence(
            'daily@09:00',
            { ...newYork, timezone: 'Invalid/Zone' },
            'Asia/Tokyo',
            'en-US'
        )
    ).toBe('Daily at 9:00 AM');
});

test('history shows frequency without implying an unknown schedule timezone', () => {
    expect(formatReminderCadence(null)).toBe('Once');
    expect(formatReminderCadence('daily@09:00')).toBe('Daily');
    expect(formatReminderCadence('weekly:mon@09:00', 'en-US')).toBe('Every Monday');
});

test('unrecognized or invalid grammar remains readable without inventing a schedule', () => {
    for (const repeat of ['custom:future', 'weekly:nope@09:00', 'daily@25:00', 'every:0m']) {
        expect(formatViewerCadence(repeat, newYork, 'UTC', 'en-US')).toBe(repeat);
        expect(formatReminderCadence(repeat)).toBe(repeat);
    }
});
