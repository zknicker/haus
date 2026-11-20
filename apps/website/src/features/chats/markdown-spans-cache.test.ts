import { expect, test } from 'bun:test';
import { readCachedMarkdownSpans } from './markdown-spans-cache.ts';

test('an unchanged fragment reuses its parse while a growing one reparses', () => {
    const settled = 'Added [WORKER.md](drive://agents/blippy/WORKER.md).';
    const first = readCachedMarkdownSpans(settled);
    const streaming = readCachedMarkdownSpans('Now writing [pl');
    const grown = readCachedMarkdownSpans('Now writing [plan](drive://plans/a.md)');

    expect(readCachedMarkdownSpans(settled)).toBe(first);
    expect(first.links).toEqual([
        { end: 50, labelEnd: 16, start: 6, url: 'drive://agents/blippy/WORKER.md' },
    ]);
    expect(grown).not.toBe(streaming);
    expect(grown.links.map((link) => link.url)).toEqual(['drive://plans/a.md']);
});

test('the cache stays bounded and still answers an evicted fragment', () => {
    const early = readCachedMarkdownSpans('early [a](drive://a.md)');
    for (let index = 0; index < 300; index += 1) {
        readCachedMarkdownSpans(`filler ${index}`);
    }
    const again = readCachedMarkdownSpans('early [a](drive://a.md)');

    expect(again).not.toBe(early);
    expect(again).toEqual(early);
});
