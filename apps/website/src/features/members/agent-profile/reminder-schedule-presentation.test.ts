import { expect, test } from 'bun:test';
import { formatReminderCadence, formatReminderSchedule } from './reminder-schedule-presentation.ts';

const reminder = {
    fireAt: '2026-10-09T13:00:00.000Z',
    repeat: 'weekly:fri@09:00',
    timezone: 'America/New_York',
};
const text = (viewerZone: string, overrides = {}) =>
    formatReminderSchedule({ ...reminder, ...overrides }, viewerZone, 'en-US').text;

test('calendar cadence and next fire share the named schedule zone', () => {
    expect(text('America/New_York')).toContain('9:00 AM · Every Friday at 9:00 AM · New York time');
    expect(text('America/New_York')).not.toContain('your time');
    expect(text('America/Detroit')).not.toContain('your time');
    expect(formatReminderSchedule(reminder, 'Asia/Tokyo').title).toContain('America/New_York');
});

test('a different viewer sees a local equivalent, including a different calendar day', () => {
    const local = text('Asia/Tokyo', { fireAt: '2026-10-09T20:00:00.000Z' });
    expect(local).toContain('4:00 PM · Every Friday at 9:00 AM · New York time');
    expect(local).toContain('Sat, Oct 10, 2026');
    expect(local).toContain('5:00 AM your time');
    expect(text('America/Los_Angeles')).toContain('6:00 AM your time');
});

test('DST changes the local equivalent, not the promised calendar clock', () => {
    for (const [fireAt, local] of [
        ['2026-03-02T14:00:00.000Z', '2:00 PM'],
        ['2026-03-09T13:00:00.000Z', '1:00 PM'],
        ['2026-10-26T13:00:00.000Z', '1:00 PM'],
        ['2026-11-02T14:00:00.000Z', '2:00 PM'],
    ]) {
        expect(text('Europe/London', { fireAt, repeat: 'weekly:mon@09:00' })).toContain(
            `Every Monday at 9:00 AM · New York time · ${local} your time`
        );
    }
});

test('multiple weekdays use calendar order and locale weekday names', () => {
    expect(text('America/New_York', { repeat: 'weekly:fri,mon,wed@09:00' })).toContain(
        'Every Mon, Wed, and Fri at 9:00 AM'
    );
    expect(
        formatReminderSchedule({ ...reminder, repeat: 'weekly:mon@09:00' }, 'UTC', 'de-DE').text
    ).toContain('Every Montag at 9:00');
});

test('fixed intervals never imply a daily wall-clock appointment', () => {
    const interval = text('America/New_York', { repeat: 'every:24h' });
    expect(interval).toContain('Every 24 hours');
    expect(interval).not.toContain('Daily');
    expect(interval).not.toContain('Every 24 hours at');
    expect(formatReminderCadence('every:1d')).toBe('Every 1 day');
    expect(formatReminderCadence('every:15m')).toBe('Every 15 minutes');
});

test('one-shot and off-slot first fires retain the actual Server instant', () => {
    expect(text('America/New_York', { repeat: null })).toContain('9:00 AM · Once · New York time');
    expect(text('America/New_York', { repeat: null })).not.toContain('Next');
    expect(
        text('America/New_York', { fireAt: '2026-10-09T19:15:00.000Z', repeat: 'daily@09:00' })
    ).toContain('3:15 PM · Daily at 9:00 AM');
});

test('history shows frequency without implying an unknown schedule timezone', () => {
    expect(formatReminderCadence(null)).toBe('Once');
    expect(formatReminderCadence('daily@09:00')).toBe('Daily');
    expect(formatReminderCadence('weekly:mon@09:00', 'en-US')).toBe('Every Monday');
});

test('unrecognized or invalid grammar remains readable without inventing a schedule', () => {
    for (const repeat of ['custom:future', 'weekly:nope@09:00', 'daily@25:00', 'every:0m']) {
        expect(text('America/New_York', { repeat })).toContain(repeat);
    }
});

test('invalid stored zones fall back to explicitly labelled viewer time', () => {
    const shown = formatReminderSchedule({ ...reminder, timezone: 'Invalid/Zone' }, 'UTC', 'en-US');
    expect(shown.text).toContain('1:00 PM your time');
    expect(shown.text).toContain('Schedule timezone unavailable');
    expect(shown.text).not.toContain(' at 9:00 AM');
    expect(shown.title).toContain('Invalid/Zone');
    expect(text('UTC', { timezone: 'UTC' })).toContain(' · UTC');
});
