import { afterAll, describe, expect, mock, test } from 'bun:test';
import type { AdventEntry } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdventCalendarRead } from '../../hooks/advent/use-advent-calendar.ts';
import { AdventDayCard } from './advent-day-card.tsx';
import { adventFallbackLine } from './advent-line.tsx';
import { openAdventDay } from './use-opened-days.ts';

const entries: readonly AdventEntry[] = [
    {
        day: 1,
        fact: 'messages-sent',
        kind: 'fact',
        line: [
            { strong: false, text: 'You sent ' },
            { strong: true, text: '4,812 messages' },
            { strong: false, text: ' this year.' },
        ],
        title: 'Messages sent',
    },
    {
        day: 2,
        fact: 'loudest-channel',
        kind: 'fact',
        line: [{ strong: true, text: '#joy-haus-ops' }],
        title: 'Your loudest channel',
    },
];

let read: AdventCalendarRead = { entries, status: 'success' };
const calendarCalls: unknown[][] = [];

mock.module('../../hooks/advent/use-advent-calendar.ts', () => ({
    useAdventCalendar: (...args: unknown[]) => {
        calendarCalls.push(args);
        return read;
    },
}));

const { AdventCalendar } = await import('./advent-calendar.tsx');
mock.restore();

afterAll(() => {
    read = { entries, status: 'success' };
});

function doorStates(markup: string) {
    return [...markup.matchAll(/<button[^>]*data-door="[^>]*>/g)].map(([tag]) => [
        Number(/data-door="(\d+)"/.exec(tag)?.[1]),
        /data-state="([a-z-]+)"/.exec(tag)?.[1],
    ]);
}

describe('the calendar', () => {
    test('renders 24 doors at once: past open, today glowing shut, the rest locked', () => {
        const markup = renderToStaticMarkup(
            <AdventCalendar season={{ today: 3, year: 2026 }} serverId="srv_render_a" />
        );
        const states = doorStates(markup);

        expect(states).toHaveLength(24);
        expect(states.slice(0, 4)).toEqual([
            [1, 'past'],
            [2, 'past'],
            [3, 'today-closed'],
            [4, 'locked'],
        ]);
        expect(states.slice(3).every(([, state]) => state === 'locked')).toBe(true);
        expect(markup).toContain('aria-label="December 1, Messages sent"');
        expect(markup).toContain('aria-label="December 3, today’s door"');
        // Showing the calendar opens no door and no card.
        expect(markup).not.toContain('See all days');
        expect(calendarCalls.at(-1)).toEqual(['srv_render_a', 2026, 3]);
    });

    test("today's door stays open once opened here", () => {
        openAdventDay('srv_render_b', 2026, 3, null);
        const markup = renderToStaticMarkup(
            <AdventCalendar season={{ today: 3, year: 2026 }} serverId="srv_render_b" />
        );

        expect(doorStates(markup)[2]).toEqual([3, 'today-open']);
    });

    test('doors render while the read is pending, with no words yet', () => {
        read = { status: 'pending' };
        const markup = renderToStaticMarkup(
            <AdventCalendar season={{ today: 25, year: 2026 }} serverId="srv_render_c" />
        );

        expect(doorStates(markup).every(([, state]) => state === 'past')).toBe(true);
        expect(markup).toContain('aria-label="December 1"');
        read = { entries, status: 'success' };
    });
});

describe('the day card', () => {
    test("shows the day, the title and the innkeeper's line with its numbers bold", () => {
        const markup = renderToStaticMarkup(
            <AdventDayCard
                day={1}
                onBack={() => undefined}
                text={{ entry: entries[0] as AdventEntry, kind: 'entry' }}
            />
        );

        expect(markup).toContain('Day 1 · December 1');
        expect(markup).toContain('Messages sent');
        expect(markup).toMatch(/<strong[^>]*>4,812 messages<\/strong>/);
        // The control sits right under the words, in the card's own flow, not pinned over the doors.
        expect(markup.indexOf('this year.')).toBeLessThan(markup.indexOf('See all days'));
        expect(markup).not.toContain('absolute');
    });

    test('keeps its text blank while the read is pending', () => {
        const markup = renderToStaticMarkup(
            <AdventDayCard day={4} onBack={() => undefined} text={{ kind: 'pending' }} />
        );

        expect(markup).not.toContain('<h3');
        expect(markup).not.toContain(adventFallbackLine.replace("'", '&#x27;'));
    });

    test('falls back to an in-voice line and no numbers when the read fails', () => {
        const markup = renderToStaticMarkup(
            <AdventDayCard day={4} onBack={() => undefined} text={{ kind: 'failed' }} />
        );

        expect(markup).toContain('The ledger&#x27;s stuck in the snow. Try again in a bit.');
        expect(markup).not.toContain('<h3');
    });

    test('Dec 24 opens the recap: the stats and the closing line', () => {
        const markup = renderToStaticMarkup(
            <AdventDayCard
                day={24}
                onBack={() => undefined}
                text={{
                    entry: {
                        closing: [
                            { strong: false, text: 'Same chair next year, ' },
                            { strong: true, text: 'Zach' },
                        ],
                        day: 24,
                        fact: 'recap',
                        kind: 'recap',
                        stats: [
                            { label: 'messages', value: '4,812' },
                            { label: 'agents', value: '7' },
                        ],
                        title: 'Your year in Haus',
                    },
                    kind: 'entry',
                }}
            />
        );

        expect(markup).toContain('Day 24 · Christmas Eve');
        expect(markup).toMatch(/<dt[^>]*>messages<\/dt><dd[^>]*>4,812<\/dd>/);
        expect(markup).toMatch(/<strong[^>]*>Zach<\/strong>/);
        expect(markup.indexOf('Zach')).toBeLessThan(markup.indexOf('See all days'));
    });
});
