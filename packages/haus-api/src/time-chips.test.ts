import { describe, expect, test } from 'bun:test';
import { findTimeChips } from './time-chips.ts';

// Friday, October 9, 2026 at 12:00 PM EDT.
const sentAt = new Date('2026-10-09T16:00:00Z');

describe('time chips', () => {
    test.each([
        ['Call at 3 PM ET.', '3 PM ET', '2026-10-09T19:00:00.000Z'],
        ['Call at 3:00 PM EDT', '3:00 PM EDT', '2026-10-09T19:00:00.000Z'],
        ['Deploy 15:00 UTC', '15:00 UTC', '2026-10-09T15:00:00.000Z'],
        ['Deploy 15:00 GMT', '15:00 GMT', '2026-10-09T15:00:00.000Z'],
        ['Sync 9am Pacific', '9am Pacific', '2026-10-09T16:00:00.000Z'],
        ['Sync 9:30 am Eastern Time', '9:30 am Eastern Time', '2026-10-09T13:30:00.000Z'],
        ['Sat, Oct 10 at 3 PM ET', 'Sat, Oct 10 at 3 PM ET', '2026-10-10T19:00:00.000Z'],
        ['on Oct 10, 2026 at 3 PM ET', 'Oct 10, 2026 at 3 PM ET', '2026-10-10T19:00:00.000Z'],
        ['tomorrow at 3 PM ET', 'tomorrow at 3 PM ET', '2026-10-10T19:00:00.000Z'],
        ['Tomorrow 3 PM ET', 'Tomorrow 3 PM ET', '2026-10-10T19:00:00.000Z'],
        ['yesterday at 3 PM ET', 'yesterday at 3 PM ET', '2026-10-08T19:00:00.000Z'],
        ['tonight at 9 p.m. MT', 'tonight at 9 p.m. MT', '2026-10-10T03:00:00.000Z'],
        ['at 3 PM ET tomorrow', '3 PM ET tomorrow', '2026-10-10T19:00:00.000Z'],
        ['at 3 PM ET on Monday', '3 PM ET on Monday', '2026-10-12T19:00:00.000Z'],
        ['Monday at 9am CT', 'Monday at 9am CT', '2026-10-12T14:00:00.000Z'],
        ['Friday at 9am CT', 'Friday at 9am CT', '2026-10-09T14:00:00.000Z'],
        ['2026-12-01 9:30 AM PT', '2026-12-01 9:30 AM PT', '2026-12-01T17:30:00.000Z'],
    ])('%p chips %p', (text, source, startsAt) => {
        expect(findTimeChips(text, sentAt)).toEqual([
            {
                end: text.indexOf(source) + source.length,
                start: text.indexOf(source),
                startsAt,
                text: source,
            },
        ]);
    });

    test.each([
        ['10–11 AM ET', '2026-10-09T14:00:00.000Z', '2026-10-09T15:00:00.000Z'],
        ['10 AM - 11:30 AM ET', '2026-10-09T14:00:00.000Z', '2026-10-09T15:30:00.000Z'],
        ['11–1 PM ET', '2026-10-09T15:00:00.000Z', '2026-10-09T17:00:00.000Z'],
        ['12 to 1 PM ET', '2026-10-09T16:00:00.000Z', '2026-10-09T17:00:00.000Z'],
        ['10 PM–1 AM PT', '2026-10-10T05:00:00.000Z', '2026-10-10T08:00:00.000Z'],
        ['14:00–15:00 UTC', '2026-10-09T14:00:00.000Z', '2026-10-09T15:00:00.000Z'],
    ])('range %p is one chip', (text, startsAt, endsAt) => {
        expect(findTimeChips(text, sentAt)).toEqual([
            { end: text.length, endsAt, start: 0, startsAt, text },
        ]);
    });

    test('US abbreviations mean the region wall clock across DST', () => {
        const at = (text: string) => findTimeChips(text, sentAt)[0]?.startsAt;
        // CST is US Central, not China; in October Chicago is on CDT.
        expect(at('3 PM CST')).toBe('2026-10-09T20:00:00.000Z');
        expect(at('3 PM PST')).toBe(at('3 PM PDT'));
        // US DST ends November 1, 2026 and starts March 14, 2027.
        expect(at('Oct 31 at 9 AM ET')).toBe('2026-10-31T13:00:00.000Z');
        expect(at('Nov 2 at 9 AM ET')).toBe('2026-11-02T14:00:00.000Z');
        expect(at('Mar 12 at 9 AM ET')).toBe('2027-03-12T14:00:00.000Z');
        expect(at('Mar 15 at 9 AM ET')).toBe('2027-03-15T13:00:00.000Z');
    });

    test('a month-day without a year is the nearest one ahead of a stale date', () => {
        expect(findTimeChips('Jan 5 at 9 AM PT', sentAt)[0]?.startsAt).toBe(
            '2027-01-05T17:00:00.000Z'
        );
        expect(findTimeChips('Sep 30 at 9 AM PT', sentAt)[0]?.startsAt).toBe(
            '2026-09-30T16:00:00.000Z'
        );
    });

    test('relative days resolve in the stated zone, not UTC', () => {
        // Friday 10:00 PM EDT, already Saturday in UTC.
        const late = new Date('2026-10-10T02:00:00Z');
        expect(findTimeChips('tomorrow at 9 AM ET', late)[0]?.startsAt).toBe(
            '2026-10-10T13:00:00.000Z'
        );
        expect(findTimeChips('tomorrow at 09:00 UTC', late)[0]?.startsAt).toBe(
            '2026-10-11T09:00:00.000Z'
        );
    });

    test('finds several chips in one message', () => {
        const chips = findTimeChips('Standup 9am PT, retro 3 PM ET, deploy 22:00 UTC.', sentAt);
        expect(chips.map((chip) => chip.text)).toEqual(['9am PT', '3 PM ET', '22:00 UTC']);
    });

    test.each([
        'tomorrow',
        'Friday ET',
        'tomorrow morning ET',
        'in 3 hours',
        'at 3 PM',
        'at 3 ET',
        'at 13 PM ET',
        'at 25:00 UTC',
        'at 10:30:00 UTC',
        'the ETA is 3 PM',
        'at 3 PM ETA',
        'Feb 30 at 3 PM ET',
        'v2.10 PT',
    ])('%p is plain text', (text) => {
        expect(findTimeChips(text, sentAt)).toEqual([]);
    });
});
