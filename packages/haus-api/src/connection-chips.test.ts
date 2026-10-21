import { expect, test } from 'bun:test';
import { rankWranglerMcpUrl } from './amazon-products.ts';
import {
    availableChipKinds,
    type ChipSourceConnection,
    chipConnection,
    presetChips,
} from './connection-chips.ts';

const rankWrangler = {
    connected: true,
    preset: 'rankwrangler',
    tools: ['rankwrangler_product', 'rankwrangler_search'],
    url: rankWranglerMcpUrl,
} satisfies ChipSourceConnection;
const linear = {
    connected: false,
    preset: 'linear',
    tools: [],
    url: 'https://mcp.linear.app/mcp',
} satisfies ChipSourceConnection;

test('a connected RankWrangler with its product tool provides product chips', () => {
    expect(availableChipKinds([rankWrangler])).toEqual(['amazon-product']);
    expect(availableChipKinds([rankWrangler, linear])).toEqual(['amazon-product', 'linear-issue']);
});

test('RankWrangler without its product tool, signed out, or at another URL provides nothing', () => {
    for (const connection of [
        { ...rankWrangler, tools: ['rankwrangler_search'] },
        { ...rankWrangler, connected: false },
        { ...rankWrangler, url: 'https://example.com/mcp' },
    ]) {
        expect(availableChipKinds([connection])).toEqual([]);
    }
});

test('any Linear connection provides issue chips, as before', () => {
    expect(availableChipKinds([linear])).toEqual(['linear-issue']);
    expect(availableChipKinds([{ ...linear, preset: null }])).toEqual([]);
});

test('the chip connection is the first one that provides it', () => {
    const signedOut = { ...rankWrangler, connected: false, id: 'a' };
    const ready = { ...rankWrangler, id: 'b' };
    expect(chipConnection('amazon-product', [signedOut, ready])?.id).toBe('b');
    expect(chipConnection('amazon-product', [signedOut])).toBeUndefined();
});

test('a preset page lists only its own chips', () => {
    expect(presetChips('rankwrangler').map((chip) => chip.title)).toEqual(['Product chips']);
    expect(presetChips('linear').map((chip) => chip.title)).toEqual(['Issue chips']);
    expect(presetChips('github')).toEqual([]);
    expect(presetChips(null)).toEqual([]);
});
