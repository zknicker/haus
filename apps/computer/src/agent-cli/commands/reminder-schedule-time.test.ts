import { expect, test } from 'bun:test';
import { runReminderSchedule } from './agent-reminder.ts';
import { absoluteReminderFireAt, reminderScheduleTime } from './reminder-schedule-time.ts';

test('offset forms from the failed model run canonicalize to the same Server timestamp', () => {
    for (const input of ['2026-10-05T21:35:57-0400', '2026-10-05T21:35:57-04:00']) {
        expect(absoluteReminderFireAt(input)).toBe('2026-10-06T01:35:57.000Z');
    }
});

test('ambiguous or impossible absolute dates fail locally before an API request', async () => {
    let requests = 0;
    const deps = {
        client: {
            request: () => {
                requests += 1;
                throw new Error('Unexpected API call');
            },
        },
        write: () => undefined,
    };
    for (const fireAt of ['2026-10-05T21:35:57', '2026-02-31T09:00:00Z']) {
        await expect(
            runReminderSchedule(
                {
                    flags: {},
                    help: false,
                    positionals: [],
                    values: {
                        '--fire-at': fireAt,
                        '--message-id': 'abcdef12',
                        '--title': 'Follow through',
                    },
                },
                deps
            )
        ).rejects.toThrow('zoned ISO timestamp');
    }
    expect(requests).toBe(0);
});

test('a calendar repeat leaves its first fire to the Server unless a slot is given', () => {
    const calendar = (values: Record<string, string>) => ({
        flags: {},
        help: false,
        positionals: [],
        values: { '--repeat': 'weekly:mon@15:57', ...values },
    });
    expect(reminderScheduleTime(calendar({}))).toBeUndefined();
    expect(reminderScheduleTime(calendar({ '--fire-at': '2026-10-12T15:57:00-04:00' }))).toBe(
        '2026-10-12T19:57:00.000Z'
    );
    expect(() => reminderScheduleTime(calendar({ '--delay-seconds': '60' }))).toThrow(
        'drop --delay-seconds'
    );
    expect(() =>
        reminderScheduleTime({ ...calendar({}), values: { '--repeat': 'every:1h' } })
    ).toThrow('exactly one of --delay-seconds or --fire-at');
});
