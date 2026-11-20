import { expect, test } from 'bun:test';
import { readCodeRanges } from './markdown-code-ranges.ts';
import { readMarkdownLinkAt, readMarkdownLinks } from './markdown-links.ts';

const targets = (text: string) => readMarkdownLinks(text).map((link) => link.target);

test('a link reads its label, target and span', () => {
    expect(readMarkdownLinkAt('See [plan](drive://a/plan.md).', 4)).toEqual({
        end: 29,
        label: 'plan',
        start: 4,
        target: 'drive://a/plan.md',
        targetStart: 11,
    });
});

test('an angle-bracket destination unwraps and keeps its spaces', () => {
    expect(targets('[plan](<drive://a/Q4 plan.md>)')).toEqual(['drive://a/Q4 plan.md']);
});

test('balanced parentheses stay in the path', () => {
    expect(targets('[draft](drive://a/Q4%20(draft).md) then (aside)')).toEqual([
        'drive://a/Q4%20(draft).md',
    ]);
});

test('links inside inline code and fenced blocks are not links', () => {
    expect(
        targets(
            'Use `[a](drive://a.md)` or ``x ` [b](drive://b.md)``.\n```\n[c](drive://c.md)\n```\n[d](drive://d.md)'
        )
    ).toEqual(['drive://d.md']);
});

test('image syntax is not a link', () => {
    expect(targets('![shot](drive://shot.png) and [doc](drive://doc.md)')).toEqual([
        'drive://doc.md',
    ]);
});

test('an unclosed or line-crossing link reads nothing', () => {
    expect(targets('[a](drive://a.md')).toEqual([]);
    expect(targets('[a](drive://a\n.md)')).toEqual([]);
    expect(targets('[a\nb](drive://a.md)')).toEqual([]);
});

test('code ranges come back in source order with their kind', () => {
    expect(readCodeRanges('`a` then\n```\nx\n```\n')).toEqual([
        { end: 3, kind: 'inline', start: 0, ticks: 1 },
        { end: 19, kind: 'fence', start: 9, ticks: 0 },
    ]);
});
