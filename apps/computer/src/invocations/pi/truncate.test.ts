import { describe, expect, test } from 'bun:test';
import {
    formatSize,
    sliceHead,
    sliceTail,
    truncateHead,
    truncateLine,
    truncateTail,
} from './truncate.ts';

const EMOJI = '\u{1F600}';

function hasLoneSurrogate(text: string) {
    return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}

describe('surrogate-safe slicing', () => {
    test('truncateLine does not cut an emoji in half at the limit', () => {
        const line = `${'a'.repeat(499)}${EMOJI}tail`;
        const { text, wasTruncated } = truncateLine(line, 500);
        expect(wasTruncated).toBe(true);
        expect(text).toBe(`${'a'.repeat(499)}... [truncated]`);
        expect(hasLoneSurrogate(text)).toBe(false);
    });

    test('truncateLine keeps an emoji that ends exactly at the limit', () => {
        const line = `${'a'.repeat(498)}${EMOJI}tail`;
        expect(truncateLine(line, 500).text).toBe(`${'a'.repeat(498)}${EMOJI}... [truncated]`);
    });

    test('sliceHead and sliceTail never split a pair', () => {
        const text = `${EMOJI}x${EMOJI}`;
        for (let units = 0; units <= text.length + 1; units++) {
            const head = sliceHead(text, units);
            const tail = sliceTail(text, units);
            expect(hasLoneSurrogate(head)).toBe(false);
            expect(hasLoneSurrogate(tail)).toBe(false);
            expect(text.startsWith(head)).toBe(true);
            expect(text.endsWith(tail)).toBe(true);
            expect(head.length).toBeGreaterThanOrEqual(Math.min(units, text.length) - 1);
            expect(tail.length).toBeGreaterThanOrEqual(Math.min(units, text.length) - 1);
        }
    });

    test('sliceHead and sliceTail match slice on text without surrogates', () => {
        expect(sliceHead('abcdef', 3)).toBe('abc');
        expect(sliceTail('abcdef', 3)).toBe('def');
        expect(sliceHead('abc', 10)).toBe('abc');
        expect(sliceTail('abc', 10)).toBe('abc');
        expect(sliceHead('abc', 0)).toBe('');
        expect(sliceTail('abc', 0)).toBe('');
    });
});

describe('truncation', () => {
    test('truncateHead keeps whole leading lines under the line limit', () => {
        expect(truncateHead('one\ntwo\nthree\n', { maxLines: 2 })).toEqual({
            content: 'one\ntwo',
            firstLineExceedsLimit: false,
            lastLinePartial: false,
            maxBytes: 51_200,
            maxLines: 2,
            outputBytes: 7,
            outputLines: 2,
            totalBytes: 14,
            totalLines: 3,
            truncated: true,
            truncatedBy: 'lines',
        });
    });

    test('truncateHead returns nothing when the first line alone exceeds the byte limit', () => {
        const result = truncateHead('abcdef\nx', { maxBytes: 4 });
        expect([result.content, result.firstLineExceedsLimit, result.truncatedBy]).toEqual([
            '',
            true,
            'bytes',
        ]);
    });

    test('truncateTail keeps the end of an over-long last line', () => {
        const result = truncateTail('short\nabcdefgh', { maxBytes: 3 });
        expect([result.content, result.lastLinePartial, result.truncatedBy]).toEqual([
            'fgh',
            true,
            'bytes',
        ]);
    });

    test('truncateTail leaves content inside both limits untouched', () => {
        const result = truncateTail('a\nb\n');
        expect([result.content, result.truncated, result.totalLines]).toEqual(['a\nb\n', false, 2]);
    });

    test('formatSize names bytes, kilobytes, and megabytes', () => {
        expect([formatSize(512), formatSize(51_200), formatSize(5 * 1024 * 1024)]).toEqual([
            '512B',
            '50.0KB',
            '5.0MB',
        ]);
    });
});
