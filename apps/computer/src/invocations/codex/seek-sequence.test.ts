import { describe, expect, test } from 'bun:test';
import { seekSequence } from './seek-sequence.ts';

describe('seekSequence', () => {
    test('exact match finds sequence', () => {
        expect(seekSequence(['foo', 'bar', 'baz'], ['bar', 'baz'], 0, false)).toBe(1);
    });

    test('rstrip match ignores trailing whitespace', () => {
        expect(seekSequence(['foo   ', 'bar\t\t'], ['foo', 'bar'], 0, false)).toBe(0);
    });

    test('trim match ignores leading and trailing whitespace', () => {
        expect(seekSequence(['    foo   ', '   bar\t'], ['foo', 'bar'], 0, false)).toBe(0);
    });

    test('pattern longer than input returns null', () => {
        expect(seekSequence(['just one line'], ['too', 'many', 'lines'], 0, false)).toBeNull();
    });

    test('typographic punctuation matches its ASCII spelling last', () => {
        expect(seekSequence(['say “hi” – it’s fine'], ['say "hi" - it\'s fine'], 0, false)).toBe(0);
        expect(seekSequence(['say “hi”'], ['say “hey”'], 0, false)).toBeNull();
    });

    test('an end-of-file pattern is searched from the end first', () => {
        expect(seekSequence(['x', 'y', 'x', 'y'], ['x', 'y'], 0, true)).toBe(2);
        expect(seekSequence(['x', 'y', 'x', 'y'], ['x', 'y'], 0, false)).toBe(0);
    });
});
