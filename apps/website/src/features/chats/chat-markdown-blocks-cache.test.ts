import { expect, test } from 'bun:test';
import { parseChatMarkdownBlocks, readChatMarkdownBlocks } from './chat-markdown-blocks.ts';

test('readChatMarkdownBlocks reuses one parse per content string', () => {
    const content = '# Notes\n\nA paragraph.\n\n| a | b |\n| - | - |\n| 1 | 2 |';
    const first = readChatMarkdownBlocks(content);

    expect(readChatMarkdownBlocks(content)).toBe(first);
    expect(first).toEqual(parseChatMarkdownBlocks(content));
    expect(readChatMarkdownBlocks(`${content}!`)).not.toBe(first);
});
