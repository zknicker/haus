import { describe, expect, test } from 'bun:test';
import { losslessMarkdownDocument, markdownFileText } from './markdown-round-trip.ts';
import { markdownSchema } from './markdown-schema.ts';
import { serializeMarkdownDocument } from './markdown-serialize.ts';

const lossless = [
    '',
    '# Title\n',
    '# Haus\n\nSome *em*, _also em_, **strong**, __strong__ and `code` here.\n',
    'A [link](https://example.com "Title") and https://auto.example.com and <https://angle.example.com>.\n',
    'Line one\nline two in the same paragraph.\n',
    'Prose with snake_case, 5 * 3, a lone [x], ~5 min, and a trailing\\\nhard break.\n',
    'An escaped \\*star\\* stays escaped.\n',
    '- one\n- two\n  - nested\n- three\n',
    '* star\n* bullets\n',
    '1. first\n2. second\n3. third\n',
    '3) three\n4) four\n',
    '- loose\n\n- items\n',
    '> quoted\n> lines\n>\n> two paragraphs\n',
    '```ts\nconst a = 1;\n\nconst b = 2;\n```\n',
    '~~~\nplain fence\n~~~\n',
    'Above\n\n---\n\nBelow\n',
    '~~gone~~ text\n',
    '## Heading **bold** `code`\n\n### Third\n',
    'No trailing newline',
    'Two trailing newlines\n\n',
];

const lossy = [
    ['setext heading', 'Title\n=====\n'],
    ['closing hashes', '# Title #\n'],
    ['table', '| a | b |\n| - | - |\n| 1 | 2 |\n'],
    ['image', '![alt](https://example.com/a.png)\n'],
    ['inline HTML', 'Some <span>html</span>\n'],
    ['block HTML', '<div>\nhi\n</div>\n'],
    ['task list', '- [ ] todo\n- [x] done\n'],
    ['entity', 'Fish &amp; chips\n'],
    ['indented code', '    indented code\n'],
    ['reference link', '[a][ref]\n\n[ref]: https://example.com\n'],
    ['unusual numbering', '1. one\n1. two\n'],
    ['extra blank lines', 'One\n\n\nTwo\n'],
    ['four-space nesting', '1. one\n    - nested\n'],
    ['carriage returns', '# Title\r\n'],
] as const;

describe('losslessMarkdownDocument', () => {
    for (const text of lossless) {
        test(`edits ${JSON.stringify(text.slice(0, 32))} in place`, () => {
            const doc = losslessMarkdownDocument(text);
            expect(doc).not.toBeNull();
            expect(doc ? markdownFileText(doc, text) : null).toBe(text);
        });
    }

    for (const [name, text] of lossy) {
        test(`keeps ${name} in source`, () => {
            expect(losslessMarkdownDocument(text)).toBeNull();
        });
    }
});

describe('serializeMarkdownDocument', () => {
    const schema = markdownSchema;
    const paragraph = (text: string) =>
        schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);

    test('escapes typed text that would otherwise read as syntax', () => {
        expect(serializeMarkdownDocument(paragraph('# not a heading'))).toBe('\\# not a heading');
        expect(serializeMarkdownDocument(paragraph('- not a list'))).toBe('\\- not a list');
        expect(serializeMarkdownDocument(paragraph('2. not a list'))).toBe('2\\. not a list');
        expect(serializeMarkdownDocument(paragraph('*not em*'))).toBe('\\*not em\\*');
        expect(serializeMarkdownDocument(paragraph('see [x](y)'))).toBe('see \\[x](y)');
        expect(serializeMarkdownDocument(paragraph('a `tick`'))).toBe('a \\`tick\\`');
    });

    test('moves whitespace outside marks', () => {
        const strong = schema.marks.strong.create();
        const doc = schema.node('doc', null, [
            schema.node('paragraph', null, [
                schema.text('a'),
                schema.text(' bold ', [strong]),
                schema.text('b'),
            ]),
        ]);
        expect(serializeMarkdownDocument(doc)).toBe('a **bold** b');
    });

    test('typed edits round-trip through the parser', () => {
        const source = '# Notes\n\n- one\n- two\n';
        const doc = losslessMarkdownDocument(source);
        expect(doc).not.toBeNull();
        const list = doc?.child(1);
        const edited = doc?.replace(
            doc.content.size,
            doc.content.size,
            schema
                .node('doc', null, [schema.node('paragraph', null, [schema.text('*star* [a](b)')])])
                .slice(0)
        );
        expect(list?.type.name).toBe('bullet_list');
        const text = edited ? markdownFileText(edited, source) : '';
        expect(text).toBe('# Notes\n\n- one\n- two\n\n\\*star\\* \\[a](b)\n');
        expect(losslessMarkdownDocument(text)).not.toBeNull();
    });
});
