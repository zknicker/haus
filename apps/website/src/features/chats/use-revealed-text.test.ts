import { expect, test } from 'bun:test';
import {
    commonPrefixLength,
    getReplacementVisibleLength,
    getRevealStep,
} from './use-revealed-text.ts';

test('getRevealStep caps large reply bursts by the per-second reveal budget', () => {
    const step = getRevealStep({
        carriedChars: 0,
        catchUpWindowMs: 650,
        elapsedMs: 100,
        maxCharsPerFrame: 1000,
        maxCharsPerSecond: 540,
        remaining: 5000,
    });

    expect(step.step).toBe(54);
    expect(step.carriedChars).toBe(0);
});

test('getRevealStep caps delayed paints by the per-frame reveal budget', () => {
    const step = getRevealStep({
        carriedChars: 0,
        catchUpWindowMs: 650,
        elapsedMs: 200,
        maxCharsPerFrame: 12,
        maxCharsPerSecond: 540,
        remaining: 5000,
    });

    expect(step.step).toBe(12);
    expect(step.carriedChars).toBe(96);
});

test('getRevealStep spends delayed frame budget across later frames', () => {
    const step = getRevealStep({
        carriedChars: 96,
        catchUpWindowMs: 650,
        elapsedMs: 16,
        maxCharsPerFrame: 12,
        maxCharsPerSecond: 540,
        remaining: 4988,
    });

    expect(step.step).toBe(12);
    expect(Math.round(step.carriedChars)).toBe(93);
});

test('getRevealStep carries fractional reveal budget across frames', () => {
    const first = getRevealStep({
        carriedChars: 0,
        elapsedMs: 16,
        maxCharsPerSecond: 30,
        remaining: 100,
    });
    const second = getRevealStep({
        carriedChars: first.carriedChars,
        elapsedMs: 16,
        maxCharsPerSecond: 30,
        remaining: 100,
    });
    const third = getRevealStep({
        carriedChars: second.carriedChars,
        elapsedMs: 16,
        maxCharsPerSecond: 30,
        remaining: 100,
    });

    expect(first.step).toBe(0);
    expect(second.step).toBe(0);
    expect(third.step).toBe(1);
});

test('commonPrefixLength finds the stable prefix for reply replacement', () => {
    expect(commonPrefixLength('Hello there', 'Hello world')).toBe(6);
    expect(commonPrefixLength('Draft', 'Final')).toBe(0);
});

test('getReplacementVisibleLength preserves progress when final formatting inserts whitespace', () => {
    expect(
        getReplacementVisibleLength({
            next: 'Hello,\nworld\nagain',
            previous: 'Hello,world again',
            previousVisibleLength: 'Hello,world'.length,
        })
    ).toBe('Hello,\nworld'.length);
});

test('getReplacementVisibleLength preserves progress when final formatting inserts punctuation', () => {
    expect(
        getReplacementVisibleLength({
            next: "Of course — here's another one:\n\nCold brew",
            previous: "Of course here's another one: Cold brew",
            previousVisibleLength: "Of course here's another one".length,
        })
    ).toBe("Of course — here's another one".length);
});

test('getReplacementVisibleLength falls back to the raw prefix for semantic replacements', () => {
    expect(
        getReplacementVisibleLength({
            next: 'A different answer',
            previous: 'A draft answer',
            previousVisibleLength: 'A draft'.length,
        })
    ).toBe('A d'.length);
});
