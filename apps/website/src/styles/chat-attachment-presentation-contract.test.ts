import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const themeCss = readFileSync(join(import.meta.dir, 'default-theme.css'), 'utf8');

function ruleBody(selector: string) {
    const start = themeCss.indexOf(`${selector} {`);
    expect(start, `${selector} is missing from the theme`).toBeGreaterThan(-1);
    return themeCss.slice(start, themeCss.indexOf('}', start)).replace(/\s+/gu, ' ');
}

test('every strip tile is the same fixed 4:3 box, sized by tokens, never by its pixels', () => {
    const block = ruleBody('.chat-attachment.chat-attachment--strip-tile');

    expect(block).toContain('width: var(--chat-media-tile-width)');
    expect(block).toContain('height: var(--chat-media-tile-height)');
    expect(block).not.toContain('aspect-ratio');
    expect(themeCss).toContain('--chat-media-tile-width: 11rem;');
    expect(themeCss).toContain('--chat-media-tile-height: 8.25rem;');
    // The retired 80px square tile, natural-size image, and mosaic overflow stay retired.
    expect(themeCss).not.toContain('chat-attachment--transcript-image');
    expect(themeCss).not.toContain('chat-attachment--message-image');
    expect(themeCss).not.toContain('chat-attachment-overflow');
});

test('a file tile stacks its mark over a two-line name and its format', () => {
    const tile = ruleBody('.chat-attachment.chat-attachment--strip-tile[data-variant="file"]');
    const name = ruleBody(
        '.chat-attachment.chat-attachment--strip-tile[data-variant="file"] .chat-attachment__name'
    );

    expect(tile).toContain('flex-direction: column');
    expect(tile).toContain('justify-content: space-between');
    expect(name).toContain('-webkit-line-clamp: 2');
    expect(name).toContain('white-space: normal');
});

test('tile focus draws inside the tile, where the strip cannot clip it', () => {
    const block = ruleBody('.chat-attachment-trigger:focus-visible > .chat-attachment');

    expect(block).toContain('outline: 2px solid var(--focus)');
    expect(block).toContain('outline-offset: -2px');
});
