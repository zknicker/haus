import { describe, expect, test } from 'bun:test';
import { formatTimeChipLabel, formatTimeFromNow, timeChipZoneRows } from './time-chip-format.ts';

const now = Date.parse('2026-10-08T16:00:00Z');
const eastern = { locale: 'en-US', now, viewerZone: 'America/New_York' };

describe('time chip label', () => {
    test('uses day words for today and tomorrow in the viewer zone', () => {
        expect(formatTimeChipLabel(new Date('2026-10-08T19:00:00Z'), eastern)).toBe(
            'Today at 3:00 PM EDT'
        );
        expect(formatTimeChipLabel(new Date('2026-10-09T13:00:00Z'), eastern)).toBe(
            'Tomorrow at 9:00 AM EDT'
        );
        expect(formatTimeChipLabel(new Date('2026-10-07T13:00:00Z'), eastern)).toBe(
            'Yesterday at 9:00 AM EDT'
        );
    });

    test('names the date further out, with the year only outside this year', () => {
        expect(formatTimeChipLabel(new Date('2026-10-10T07:00:00Z'), eastern)).toBe(
            'Sat, Oct 10 at 3:00 AM EDT'
        );
        expect(formatTimeChipLabel(new Date('2027-01-15T15:00:00Z'), eastern)).toBe(
            'Fri, Jan 15, 2027 at 10:00 AM EST'
        );
    });

    test('reads the same instant in another viewer zone', () => {
        expect(
            formatTimeChipLabel(new Date('2026-10-10T07:00:00Z'), {
                ...eastern,
                viewerZone: 'America/Los_Angeles',
            })
        ).toBe('Sat, Oct 10 at 12:00 AM PDT');
    });
});

describe('time hover rows', () => {
    test('lists the viewer zone first, then Pacific, Eastern, and UTC', () => {
        const rows = timeChipZoneRows(new Date('2026-10-10T07:00:00Z'), {
            ...eastern,
            viewerZone: 'Europe/Berlin',
        });
        expect(rows.map((row) => row.label)).toEqual([
            'Your time · Berlin',
            'Pacific',
            'Eastern',
            'UTC',
        ]);
        expect(rows[0]?.time).toBe('Saturday, October 10 at 9:00 AM GMT+2');
        expect(rows[2]?.time).toBe('Saturday, October 10 at 3:00 AM EDT');
    });

    test('drops the reference row the viewer already lives in', () => {
        expect(
            timeChipZoneRows(new Date('2026-10-10T07:00:00Z'), eastern).map((row) => row.label)
        ).toEqual(['Your time · New York', 'Pacific', 'UTC']);
        expect(
            timeChipZoneRows(new Date('2026-10-10T07:00:00Z'), {
                ...eastern,
                viewerZone: 'Etc/UTC',
            }).map((row) => row.zone)
        ).toHaveLength(3);
    });

    test('adds the year outside this year', () => {
        const rows = timeChipZoneRows(new Date('2027-01-15T15:00:00Z'), eastern);
        expect(rows[0]?.time).toBe('Friday, January 15, 2027 at 10:00 AM EST');
    });
});

test('relative distance counts hours within a day, then calendar days', () => {
    expect(formatTimeFromNow(new Date('2026-10-10T16:00:00Z'), eastern)).toBe('in 2 days');
    // 39 hours away, but Saturday is two calendar days from Thursday.
    expect(formatTimeFromNow(new Date('2026-10-10T07:00:00Z'), eastern)).toBe('in 2 days');
    expect(formatTimeFromNow(new Date('2026-10-08T19:30:00Z'), eastern)).toBe('in 4 hours');
    expect(formatTimeFromNow(new Date('2026-10-08T13:00:00Z'), eastern)).toBe('3 hours ago');
    expect(formatTimeFromNow(new Date('2026-10-08T16:00:20Z'), eastern)).toBe('now');
});

test('a range reads both ends in one label', () => {
    const range = (start: string, end: string) =>
        formatTimeChipLabel(new Date(start), eastern, new Date(end));
    expect(range('2026-10-08T14:00:00Z', '2026-10-08T15:00:00Z')).toBe(
        'Today at 10:00 – 11:00 AM EDT'
    );
    expect(range('2026-10-09T02:00:00Z', '2026-10-09T05:00:00Z')).toBe(
        'Today at 10:00 PM EDT – Tomorrow at 1:00 AM EDT'
    );
    const rows = timeChipZoneRows(
        new Date('2026-10-08T14:00:00Z'),
        eastern,
        new Date('2026-10-08T15:00:00Z')
    );
    expect(rows[0]?.time).toBe('Thursday, October 8 at 10:00 AM EDT – 11:00 AM EDT');
});
