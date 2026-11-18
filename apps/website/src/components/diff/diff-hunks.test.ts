import { describe, expect, test } from 'bun:test';
import { buildDiffHunks, countDiffStats } from './diff-hunks.ts';

describe('buildDiffHunks', () => {
    test('maps modified text into add/del/context lines with line numbers', () => {
        const hunks = buildDiffHunks('one\ntwo\nthree\n', 'one\nchanged\nthree\n');
        expect(hunks).toHaveLength(1);
        const lines = hunks[0]?.lines ?? [];
        expect(lines.map((line) => [line.kind, line.text])).toEqual([
            ['context', 'one'],
            ['del', 'two'],
            ['add', 'changed'],
            ['context', 'three'],
        ]);
        expect(lines[1]).toMatchObject({ newLine: null, oldLine: 2 });
        expect(lines[2]).toMatchObject({ newLine: 2, oldLine: null });
    });

    test('created content is all additions and empty pairs produce no hunks', () => {
        const created = buildDiffHunks('', 'a\nb\n');
        expect(countDiffStats(created)).toEqual({ additions: 2, deletions: 0 });
        expect(buildDiffHunks('same\n', 'same\n')).toHaveLength(0);
    });

    test('drops no-newline markers instead of rendering them as lines', () => {
        const hunks = buildDiffHunks('a', 'b');
        const texts = hunks.flatMap((hunk) => hunk.lines.map((line) => line.text));
        expect(texts).toEqual(['a', 'b']);
    });
});
