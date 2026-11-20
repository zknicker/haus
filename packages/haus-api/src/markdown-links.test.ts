import { expect, test } from 'bun:test';
import { readMarkdownSpans } from './markdown-links.ts';

const urls = (text: string) => readMarkdownSpans(text).links.map((link) => link.url);

test('a link reads its span, label end and url', () => {
    expect(readMarkdownSpans('See [plan](drive://a/plan.md).').links).toEqual([
        { end: 29, labelEnd: 9, start: 4, url: 'drive://a/plan.md' },
    ]);
});

test('an angle-bracket destination keeps its spaces, trailing ones too', () => {
    expect(urls('[plan](<drive://a/Q4 plan.md>) [s](<drive://a/space.md >)')).toEqual([
        'drive://a/Q4 plan.md',
        'drive://a/space.md ',
    ]);
});

test('balanced and escaped parentheses stay in the path, and a title does not', () => {
    expect(
        urls(
            '[d](drive://a/Q4%20(draft).md) [e](drive://a/a\\(draft.md) [t](drive://a/t.md "Title") [p]( <drive://a/p.md> "P")'
        )
    ).toEqual([
        'drive://a/Q4%20(draft).md',
        'drive://a/a(draft.md',
        'drive://a/t.md',
        'drive://a/p.md',
    ]);
});

test('links inside any kind of code are not links', () => {
    expect(
        urls(
            [
                'Use `[a](drive://a.md)` or ``x ` [b](drive://b.md)``.',
                '`multi',
                '[c](drive://c.md) line`',
                '`a`` [m](drive://m.md) `',
                '',
                '> ```',
                '> [q](drive://q.md)',
                '> ```',
                '',
                '```',
                '[f](drive://f.md)',
                '```',
                '[d](drive://d.md)',
            ].join('\n')
        )
    ).toEqual(['drive://d.md']);
});

test('image syntax and autolinks are not written links', () => {
    expect(urls('![shot](drive://shot.png) <https://haus.test> [doc](drive://doc.md)')).toEqual([
        'drive://doc.md',
    ]);
});

test('GFM tables split cells at a pipe, and literal autolinks are not written links', () => {
    expect(
        urls(
            '| A | B | C |\n| --- | --- | --- |\n| [p](drive://pipe|x.md) | [c](drive://cell.md) |\n\n~~[s](drive://s.md)~~ www.haus.test'
        )
    ).toEqual(['drive://cell.md', 'drive://s.md']);
});

test('a table row cell past the header width is dropped, as the renderer drops it', () => {
    expect(urls('| A |\n| --- |\n| [a](drive://a.md) | [extra](drive://extra.md) |')).toEqual([
        'drive://a.md',
    ]);
});

test('an unclosed or line-crossing destination reads nothing', () => {
    expect(urls('[a](drive://a.md')).toEqual([]);
    expect(urls('[a](drive://a\n.md)')).toEqual([]);
});

test('code spans report where their content sits', () => {
    expect(readMarkdownSpans('``a` b`` then\n```\nx\n```\n').code).toEqual([
        { contentEnd: 6, contentStart: 2, end: 8, kind: 'inline', start: 0 },
        { contentEnd: 23, contentStart: 14, end: 23, kind: 'block', start: 14 },
    ]);
});
