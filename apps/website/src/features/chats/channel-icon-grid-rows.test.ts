import { describe, expect, test } from 'bun:test';
import type { IconSvgElement } from '@hugeicons/react';
import type { ChannelIconEntry } from '../../components/chats/channel-icon-catalog.ts';
import { buildChannelIconRows, channelIconRowIndex } from './channel-icon-grid-rows.ts';

const glyph = [] as unknown as IconSvgElement;
const groups = ['Work', 'Food'];

function entry(name: string, group: string): ChannelIconEntry {
    return { glyph, group, keywords: [], label: name, name };
}

const entries = [
    entry('w1', 'Work'),
    entry('w2', 'Work'),
    entry('w3', 'Work'),
    entry('f1', 'Food'),
];

describe('buildChannelIconRows', () => {
    test('opens each group with a header and chunks it into rows', () => {
        const rows = buildChannelIconRows({ columns: 2, entries, groups, isGrouped: true });

        expect(rows.map((row) => (row.kind === 'header' ? row.group : row.entries.length))).toEqual(
            ['Work', 2, 1, 'Food', 1]
        );
    });

    test('drops groups the query emptied rather than leaving a bare header', () => {
        const rows = buildChannelIconRows({
            columns: 2,
            entries: [entry('f1', 'Food')],
            groups,
            isGrouped: true,
        });

        expect(rows.map((row) => row.kind)).toEqual(['header', 'icons']);
    });

    test('follows the catalog group order, not the order icons happen to arrive', () => {
        const rows = buildChannelIconRows({
            columns: 4,
            entries: [entry('f1', 'Food'), entry('w1', 'Work')],
            groups,
            isGrouped: true,
        });

        expect(rows.filter((row) => row.kind === 'header').map((row) => row.group)).toEqual([
            'Work',
            'Food',
        ]);
    });

    test('flattens to one headerless run while searching', () => {
        const rows = buildChannelIconRows({ columns: 3, entries, groups, isGrouped: false });

        expect(rows.every((row) => row.kind === 'icons')).toBe(true);
        expect(rows).toHaveLength(2);
    });

    test('has no rows at all when the query matched nothing', () => {
        expect(buildChannelIconRows({ columns: 3, entries: [], groups, isGrouped: false })).toEqual(
            []
        );
    });
});

describe('channelIconRowIndex', () => {
    test('finds the row holding an icon, counting headers', () => {
        const rows = buildChannelIconRows({ columns: 2, entries, groups, isGrouped: true });

        expect(channelIconRowIndex(rows, 'w3')).toBe(2);
        expect(channelIconRowIndex(rows, 'f1')).toBe(4);
    });

    test('reports -1 when the query filtered the icon out', () => {
        const rows = buildChannelIconRows({ columns: 2, entries, groups, isGrouped: true });

        expect(channelIconRowIndex(rows, 'missing')).toBe(-1);
    });
});
