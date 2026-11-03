import { describe, expect, test } from 'bun:test';
import { adventEntrySchema, adventFacts } from '@haus/api';
import type { AdventCountedFact } from '../fact-stats.ts';
import {
    type AdventRecapStats,
    composeFactEntry,
    composeRecapEntry,
    factCopy,
} from './compose-entry.ts';
import { line, pickVariant, variantSeed } from './line.ts';

const titles = [
    'Messages sent',
    'Your loudest channel',
    'Your busiest hour',
    'A full house',
    'The early bird',
    'Agents at your table',
    'The agent you thanked most',
    'Files on the shelf',
    'The night owl',
    'Your closest DM',
    'Your longest thread',
    'Tokens burned',
    'The quickest reply',
    'Your busiest day',
    'Tasks closed',
    'New rooms',
    'The quiet month',
    'Threads tied off',
    'Your favourite reaction',
    'The hardest worker',
    'In demand',
    'The long run',
    'Weekends off',
];

const countedFacts = adventFacts.filter((fact) => fact !== 'recap') as AdventCountedFact[];

describe('fact copy', () => {
    test('every door has its title, in door order', () => {
        expect(countedFacts.map((fact) => factCopy[fact].title)).toEqual(titles);
    });

    test('an empty fact uses its fallback line and states no number', () => {
        for (const [index, fact] of countedFacts.entries()) {
            const entry = composeFactEntry({
                day: index + 1,
                fact,
                seed: 'usr_a:2026:1',
                stat: null,
            });
            expect(adventEntrySchema.parse(entry)).toEqual(entry);
            if (entry.kind !== 'fact') {
                throw new Error('Expected a fact entry.');
            }
            // Counted values are always strong runs; a fallback has none.
            expect(entry.line.some((run) => run.strong)).toBe(false);
            expect(factCopy[fact].empty).toContainEqual(entry.line);
        }
    });

    test('a counted fact sets its numbers and names in strong runs', () => {
        const entry = composeFactEntry({
            day: 2,
            fact: 'loudest-channel',
            seed: variantSeed('usr_a', 2026, 2),
            stat: { count: 1234, name: '#product' },
        });
        if (entry.kind !== 'fact') {
            throw new Error('Expected a fact entry.');
        }
        const strong = entry.line.filter((run) => run.strong).map((run) => run.text);
        expect(strong).toContain('1,234');
        expect(strong).toContain('#product');
        expect(
            entry.line.filter((run) => !run.strong).every((run) => !run.text.includes('1,234'))
        ).toBe(true);
    });

    test('variant choice is stable per member, year and door, and varies across them', () => {
        const stat = { count: 42 };
        const pick = (userId: string, year: number) =>
            composeFactEntry({
                day: 1,
                fact: 'messages-sent',
                seed: variantSeed(userId, year, 1),
                stat,
            });
        expect(pick('usr_a', 2026)).toEqual(pick('usr_a', 2026));
        const lines = new Set(
            ['usr_a', 'usr_b', 'usr_c', 'usr_d', 'usr_e', 'usr_f', 'usr_g', 'usr_h'].map((userId) =>
                JSON.stringify(pick(userId, 2026))
            )
        );
        expect(lines.size).toBeGreaterThan(1);
    });

    test('pickVariant is a pure function of its seed', () => {
        const variants = ['a', 'b', 'c'];
        expect(pickVariant(variants, 'seed')).toBe(pickVariant(variants, 'seed'));
    });
});

describe('line', () => {
    test('merges neighbours of one weight and drops empty text', () => {
        expect(line('a', '', 'b', { strong: '1' }, { strong: '2' }, 'c')).toEqual([
            { strong: false, text: 'ab' },
            { strong: true, text: '12' },
            { strong: false, text: 'c' },
        ]);
    });
});

describe('recap', () => {
    const empty: AdventRecapStats = {
        agents: null,
        busiestHour: null,
        counts: { chats: 0, threads: 0 },
        loudest: null,
        messages: null,
        tasks: null,
        thanked: null,
        tokens: null,
    };

    test('carries every stat with data, in order', () => {
        const entry = composeRecapEntry(
            {
                agents: { count: 3 },
                busiestHour: { count: 40, hour: 16 },
                counts: { chats: 9, threads: 4 },
                loudest: { count: 200, name: '#product' },
                messages: { count: 1200 },
                tasks: { count: 15 },
                thanked: { count: 12, name: 'Blippy' },
                tokens: { tokens: 1_250_000 },
            },
            'seed'
        );
        expect(adventEntrySchema.parse(entry)).toEqual(entry);
        if (entry.kind !== 'recap') {
            throw new Error('Expected the recap.');
        }
        expect(entry.stats).toEqual([
            { label: 'Messages', value: '1,200' },
            { label: 'Chats', value: '9' },
            { label: 'Threads', value: '4' },
            { label: 'Agents', value: '3' },
            { label: 'Tasks closed', value: '15' },
            { label: 'Tokens', value: '1.3M' },
            { label: 'Busiest hour', value: '4pm' },
            { label: 'Most thanked', value: 'Blippy' },
        ]);
        expect(entry.closing).toContainEqual({ strong: true, text: '#product' });
    });

    test('omits stats with no data', () => {
        const entry = composeRecapEntry(
            { ...empty, counts: { chats: 2, threads: 0 }, messages: { count: 5 } },
            'seed'
        );
        if (entry.kind !== 'recap') {
            throw new Error('Expected the recap.');
        }
        expect(entry.stats.map((stat) => stat.label)).toEqual(['Messages', 'Chats']);
        expect(entry.closing.some((run) => run.strong)).toBe(false);
    });

    test('a year with nothing counted still shows its true zero', () => {
        const entry = composeRecapEntry(empty, 'seed');
        expect(adventEntrySchema.parse(entry)).toEqual(entry);
        if (entry.kind !== 'recap') {
            throw new Error('Expected the recap.');
        }
        expect(entry.stats).toEqual([{ label: 'Messages', value: '0' }]);
    });
});
