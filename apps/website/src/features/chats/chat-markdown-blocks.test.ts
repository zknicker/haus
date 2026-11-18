import { expect, test } from 'bun:test';
import { parseChatMarkdownBlocks } from './chat-markdown-blocks.ts';

test('parseChatMarkdownBlocks spans a pipe table through its last row', () => {
    const content = 'Totals:\n\n| Week | Revenue |\n| --- | ---: |\n| Sep 1 | $1,240 |\n\nUp 12%.';
    const blocks = parseChatMarkdownBlocks(content);

    expect(blocks.map((block) => block.kind)).toEqual(['prose', 'table', 'prose']);

    const table = blocks[1];

    expect(table?.text).toBe('| Week | Revenue |\n| --- | ---: |\n| Sep 1 | $1,240 |');
    expect(content.slice(table?.start ?? 0, (table?.start ?? 0) + (table?.text.length ?? 0))).toBe(
        table?.text
    );
    expect(blocks[2]?.text).toBe('Up 12%.');
});

test('parseChatMarkdownBlocks keeps a header without a delimiter row as prose', () => {
    const blocks = parseChatMarkdownBlocks('| Week | Revenue |\n| Sep 1 | $1,240 |');

    expect(blocks.map((block) => block.kind)).toEqual(['prose']);
});

test('parseChatMarkdownBlocks rejects a delimiter row that does not match the header', () => {
    const blocks = parseChatMarkdownBlocks('| Week | Revenue |\n| --- |\n| Sep 1 | $1,240 |');

    expect(blocks.map((block) => block.kind)).toEqual(['prose']);
});

test('parseChatMarkdownBlocks leaves a setext underline alone', () => {
    const blocks = parseChatMarkdownBlocks('Totals\n---\n');

    expect(blocks.map((block) => block.kind)).toEqual(['prose']);
});

test('parseChatMarkdownBlocks ignores a pipe table inside a fence', () => {
    const blocks = parseChatMarkdownBlocks('```\n| Week | Revenue |\n| --- | --- |\n```');

    expect(blocks.map((block) => block.kind)).toEqual(['prose']);
});

test('parseChatMarkdownBlocks stops a table at the first line without a pipe', () => {
    const blocks = parseChatMarkdownBlocks('| Week |\n| --- |\n| Sep 1 |\nUp 12%.');

    expect(blocks.map((block) => block.kind)).toEqual(['table', 'prose']);
    expect(blocks[0]?.text).toBe('| Week |\n| --- |\n| Sep 1 |');
    expect(blocks[1]?.text).toBe('Up 12%.');
});

test('parseChatMarkdownBlocks keeps a heading after a table separate', () => {
    const blocks = parseChatMarkdownBlocks('| A |\n| --- |\n| 1 |\n\n## Next\n\nText.');

    expect(blocks.map((block) => block.kind)).toEqual(['table', 'prose', 'heading', 'prose']);
    expect(blocks[1]?.text).toBe('');
});
