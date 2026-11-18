import { describe, expect, test } from 'bun:test';
import type { IconSvgElement } from '@hugeicons/react';
import { type ChannelIconEntry, filterChannelIcons } from './channel-icon-catalog.ts';

const glyph = [] as unknown as IconSvgElement;

const entries: ChannelIconEntry[] = [
    { glyph, group: 'Tech', keywords: ['rocket'], label: 'Rocket', name: 'RocketIcon' },
    {
        glyph,
        group: 'Work',
        keywords: ['task', 'daily'],
        label: 'Task Daily',
        name: 'TaskDaily01Icon',
    },
    { glyph, group: 'Food', keywords: ['coffee', 'cup'], label: 'Coffee Cup', name: 'CoffeeIcon' },
];

describe('filterChannelIcons', () => {
    test('keeps every icon for an empty query', () => {
        expect(filterChannelIcons(entries, '   ')).toEqual(entries);
    });

    test('matches labels case-insensitively', () => {
        expect(filterChannelIcons(entries, 'ROCK').map((entry) => entry.name)).toEqual([
            'RocketIcon',
        ]);
    });

    test('matches keywords the label alone does not spell', () => {
        expect(filterChannelIcons(entries, 'cup').map((entry) => entry.name)).toEqual([
            'CoffeeIcon',
        ]);
    });

    test('requires every token to match', () => {
        expect(filterChannelIcons(entries, 'task daily').map((entry) => entry.name)).toEqual([
            'TaskDaily01Icon',
        ]);
        expect(filterChannelIcons(entries, 'task rocket')).toEqual([]);
    });
});
