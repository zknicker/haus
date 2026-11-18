import { expect, test } from 'bun:test';
import {
    getNextStreamingTextRanges,
    pruneStreamingTextRanges,
} from './chat-streaming-text-ranges.ts';

test('streaming text ranges mark only appended text as fresh', () => {
    expect(
        getNextStreamingTextRanges({
            nextText: 'Hello there',
            now: 100,
            previousText: 'Hello',
            ranges: [],
        })
    ).toEqual([
        {
            createdAt: 100,
            end: 11,
            id: '5:11:100',
            start: 5,
        },
    ]);
});

test('streaming text ranges keep recent chunks until they expire', () => {
    const ranges = [
        {
            createdAt: 100,
            end: 8,
            id: '5:8:100',
            start: 5,
        },
    ];

    expect(
        getNextStreamingTextRanges({
            durationMs: 420,
            nextText: 'Hello there',
            now: 220,
            previousText: 'Hello th',
            ranges,
        })
    ).toEqual([
        ranges[0],
        {
            createdAt: 220,
            end: 11,
            id: '8:11:220',
            start: 8,
        },
    ]);
});

test('streaming text ranges drop expired and replaced chunks', () => {
    const ranges = [
        {
            createdAt: 100,
            end: 8,
            id: '5:8:100',
            start: 5,
        },
    ];

    expect(
        pruneStreamingTextRanges({
            durationMs: 420,
            now: 600,
            ranges,
            textLength: 8,
        })
    ).toEqual([]);

    expect(
        getNextStreamingTextRanges({
            nextText: 'Help me',
            now: 240,
            previousText: 'Hello th',
            ranges,
        })
    ).toEqual([
        {
            createdAt: 240,
            end: 7,
            id: '3:7:240',
            start: 3,
        },
    ]);
});
