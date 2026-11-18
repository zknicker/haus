import { expect, test } from 'bun:test';
import { escapeBareOrderedMarkers } from './bare-ordered-marker.ts';

test('escapes a reply that is only a number sentence', () => {
    expect(escapeBareOrderedMarkers('42.')).toBe('42\\.');
    expect(escapeBareOrderedMarkers('144) ')).toBe('144\\)');
    expect(escapeBareOrderedMarkers('Sure.\n\n7.\nThat is the count.')).toBe(
        'Sure.\n\n7\\.\nThat is the count.'
    );
});

test('keeps real ordered lists, list continuations, and fenced code', () => {
    expect(escapeBareOrderedMarkers('1. first\n2. second')).toBe('1. first\n2. second');
    expect(escapeBareOrderedMarkers('1. first\n2.\n3. third')).toBe('1. first\n2.\n3. third');
    expect(escapeBareOrderedMarkers('```\n\n42.\n```')).toBe('```\n\n42.\n```');
    expect(escapeBareOrderedMarkers('    42.')).toBe('    42.');
    expect(escapeBareOrderedMarkers('42. is the answer')).toBe('42. is the answer');
});
