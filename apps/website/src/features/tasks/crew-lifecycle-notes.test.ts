import { expect, test } from 'bun:test';
import { crewLifecycleNotes, formatWorkedFor } from './crew-lifecycle-notes.ts';

const haiku = { shortId: 'k3mq7xta', taskId: 'tsk_haiku', title: 'Write the haiku' };
const notes = { shortId: 'p2rt9wvb', taskId: 'tsk_notes', title: 'Describe the haiku' };

test('crew that finish together read as one line naming each, with how long they worked', () => {
    const lines = crewLifecycleNotes(
        {
            archives: [
                { ...haiku, archivedAt: '2026-11-26T10:00:50Z' },
                { ...notes, archivedAt: '2026-11-26T10:00:51Z' },
            ],
            turns: [
                {
                    ...notes,
                    endedAt: '2026-11-26T10:00:23Z',
                    startedAt: '2026-11-26T10:00:02Z',
                    status: 'completed',
                },
                {
                    ...haiku,
                    endedAt: '2026-11-26T10:00:20Z',
                    startedAt: '2026-11-26T10:00:00Z',
                    status: 'completed',
                },
            ],
        },
        new Map([['tsk_haiku', 'OVER-7']])
    );
    expect(lines.map((line) => [line.text, line.timestamp])).toEqual([
        ['OVER-7 and Describe the haiku finished, worked for 23s', '2026-11-26T10:00:23.000Z'],
        ['OVER-7 and Describe the haiku archived', '2026-11-26T10:00:51.000Z'],
    ]);
});

test('a failed turn and turns far apart get lines of their own', () => {
    const lines = crewLifecycleNotes(
        {
            archives: [],
            turns: [
                {
                    ...haiku,
                    endedAt: '2026-11-26T10:00:20Z',
                    startedAt: '2026-11-26T10:00:00Z',
                    status: 'failed',
                },
                {
                    ...haiku,
                    endedAt: '2026-11-26T11:30:00Z',
                    startedAt: '2026-11-26T11:00:00Z',
                    status: 'completed',
                },
            ],
        },
        new Map()
    );
    expect(lines.map((line) => line.text)).toEqual([
        'Write the haiku failed after 20s',
        'Write the haiku finished, worked for 30m',
    ]);
});

test('worked-for reads in seconds, minutes, then hours', () => {
    expect(formatWorkedFor(400)).toBe('1s');
    expect(formatWorkedFor(59_000)).toBe('59s');
    expect(formatWorkedFor(4 * 60_000)).toBe('4m');
    expect(formatWorkedFor(65 * 60_000)).toBe('1h 5m');
    expect(formatWorkedFor(120 * 60_000)).toBe('2h');
});
