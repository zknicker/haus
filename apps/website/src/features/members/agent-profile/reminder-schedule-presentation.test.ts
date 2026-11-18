import { expect, test } from 'bun:test';
import {
    formatReminderRowSummary,
    formatReminderScheduleDetail,
    reminderKind,
    reminderKindLabel,
} from './reminder-schedule-presentation.ts';

// Thursday, Oct 8 2026, noon in New York.
const now = Date.parse('2026-10-08T16:00:00.000Z');
const context = { locale: 'en-US', now, viewerZone: 'America/New_York' };
const reminder = {
    fireAt: '2026-10-10T20:00:00.000Z',
    repeat: null as string | null,
    timezone: 'UTC',
};
const row = (overrides: Partial<typeof reminder>, viewerZone = 'America/New_York') =>
    formatReminderRowSummary({ ...reminder, ...overrides }, { ...context, viewerZone });

test('the kind is one of two, and says so', () => {
    expect(reminderKind({ repeat: null })).toBe('once');
    expect(reminderKind({ repeat: 'daily@09:00' })).toBe('recurring');
    expect(reminderKindLabel('once')).toBe('One-time reminder');
    expect(reminderKindLabel('recurring')).toBe('Recurring reminder');
});

test('a one-time row leads with Once and reads in the viewer time, without zone text', () => {
    expect(row({})).toBe('Once · Sat, Oct 10 at 4:00 PM');
    expect(row({})).not.toContain('UTC');
    expect(row({})).not.toContain('your time');
});

test('a near run uses relative day words', () => {
    expect(row({ fireAt: '2026-10-08T21:30:00.000Z' })).toBe('Once · Today at 5:30 PM');
    expect(row({ fireAt: '2026-10-09T13:00:00.000Z' })).toBe('Once · Tomorrow at 9:00 AM');
    // A wake still waiting on an offline Agent.
    expect(row({ fireAt: '2026-10-07T13:00:00.000Z' })).toBe('Once · Yesterday at 9:00 AM');
});

test('a run in another year names the year', () => {
    expect(row({ fireAt: '2027-01-04T15:00:00.000Z' })).toBe('Once · Mon, Jan 4, 2027 at 10:00 AM');
});

test('a recurring row leads with its cadence and names the next run by day', () => {
    expect(
        row({ fireAt: '2026-10-12T19:57:00.000Z', repeat: 'weekly:mon@19:57', timezone: 'UTC' })
    ).toBe('Every Monday at 3:57 PM · Next run Mon, Oct 12');
    expect(
        row({
            fireAt: '2026-10-09T13:00:00.000Z',
            repeat: 'daily@09:00',
            timezone: 'America/New_York',
        })
    ).toBe('Daily at 9:00 AM · Next run tomorrow');
});

test('a recurring row adds the next clock only when the cadence does not say it', () => {
    // An interval has no clock of its own.
    expect(row({ fireAt: '2026-10-08T21:30:00.000Z', repeat: 'every:30m' })).toBe(
        'Every 30 minutes · Next run today at 5:30 PM'
    );
    // An off-slot first fire keeps the Server's actual instant.
    expect(
        row({ fireAt: '2026-10-12T19:57:00.000Z', repeat: 'weekly:mon@15:57', timezone: 'UTC' })
    ).toBe('Every Monday at 11:57 AM · Next run Mon, Oct 12 at 3:57 PM');
});

test('the detail carries the schedule zone and its clock there when it differs', () => {
    const detail = formatReminderScheduleDetail(reminder, context);
    expect(detail).toEqual({
        nextRun: 'Sat, Oct 10, 2026 at 4:00 PM',
        repeats: "Doesn't repeat",
        timezone: 'UTC · 8:00 PM there',
    });
    expect(
        formatReminderScheduleDetail(
            {
                fireAt: '2026-10-09T13:00:00.000Z',
                repeat: 'daily@09:00',
                timezone: 'America/New_York',
            },
            context
        )
    ).toEqual({
        nextRun: 'Fri, Oct 9, 2026 at 9:00 AM',
        repeats: 'Daily at 9:00 AM',
        timezone: 'New York time · Same as yours',
    });
});

test('the detail names the weekday there when the schedule zone is on another day', () => {
    const detail = formatReminderScheduleDetail(
        {
            fireAt: '2026-10-10T01:00:00.000Z',
            repeat: 'weekly:fri@21:00',
            timezone: 'America/New_York',
        },
        { ...context, viewerZone: 'Asia/Tokyo' }
    );
    expect(detail.repeats).toBe('Every Saturday at 10:00 AM');
    expect(detail.nextRun).toBe('Sat, Oct 10, 2026 at 10:00 AM');
    expect(detail.timezone).toBe('New York time · Fri 9:00 PM there');
});

test('an unrecognized stored zone is named rather than silently replaced', () => {
    const detail = formatReminderScheduleDetail({ ...reminder, timezone: 'Invalid/Zone' }, context);
    expect(detail.timezone).toBe('Invalid/Zone · Unrecognized timezone');
    expect(detail.nextRun).toBe('Sat, Oct 10, 2026 at 4:00 PM');
});

test("the saved zone, not the device's, drives the row, the detail and Same as yours", () => {
    // Kolkata is a half-hour zone no test machine is assumed to run in.
    const saved = { ...context, viewerZone: 'Asia/Kolkata' };
    const daily = {
        fireAt: '2026-10-09T03:30:00.000Z',
        repeat: 'daily@09:00',
        timezone: 'Asia/Kolkata',
    };
    expect(formatReminderRowSummary(daily, saved)).toBe('Daily at 9:00 AM · Next run tomorrow');
    expect(formatReminderScheduleDetail(daily, saved)).toEqual({
        nextRun: 'Fri, Oct 9, 2026 at 9:00 AM',
        repeats: 'Daily at 9:00 AM',
        timezone: 'Kolkata time · Same as yours',
    });
    expect(formatReminderScheduleDetail(daily, context).timezone).toBe(
        'Kolkata time · Fri 9:00 AM there'
    );
});
