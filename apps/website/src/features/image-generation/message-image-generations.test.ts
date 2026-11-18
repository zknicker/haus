import { expect, test } from 'bun:test';
import { formatImageGenerationLink } from '@haus/api';
import { imageGenerationFixture } from './image-generation-fixture.ts';
import { splitImageGenerationContent } from './message-image-generations.ts';

const a = imageGenerationFixture({ id: 'img_a' });
const b = imageGenerationFixture({ id: 'img_b' });
const c = imageGenerationFixture({ id: 'img_c' });
const link = formatImageGenerationLink;

test('a message without generations is one text segment', () => {
    expect(splitImageGenerationContent('hello', [])).toEqual([
        { key: 'text:0', kind: 'text', text: 'hello' },
    ]);
});

test('a lone link paragraph becomes a one-card segment at its position', () => {
    const segments = splitImageGenerationContent(`Before\n\n${link('img_a')}\n\nAfter`, [a]);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'images', 'text']);
    expect(segments[0]).toMatchObject({ text: 'Before' });
    expect(segments[1]).toMatchObject({ generations: [a] });
    expect(segments[2]).toMatchObject({ text: 'After' });
});

test('consecutive link paragraphs share one strip, in link order', () => {
    const content = `Here:\n\n${link('img_a')}\n\n${link('img_b')} ${link('img_c')}`;
    const segments = splitImageGenerationContent(content, [a, b, c]);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'images']);
    expect(segments[1]).toMatchObject({ generations: [a, b, c] });
});

test('text between two link paragraphs splits them into separate strips', () => {
    const content = `${link('img_a')}\n\nand then\n\n${link('img_b')}`;
    const segments = splitImageGenerationContent(content, [a, b]);
    expect(segments.map((segment) => segment.kind)).toEqual(['images', 'text', 'images']);
});

test('a link the Server did not record stays visible text', () => {
    const content = `${link('img_forged')}`;
    const segments = splitImageGenerationContent(content, [a]);
    expect(segments[0]).toMatchObject({ kind: 'text', text: content });
    // The recorded generation still renders, after the text.
    expect(segments[1]).toMatchObject({ generations: [a], kind: 'images' });
});

test('an inline link keeps its sentence and its card follows its paragraph', () => {
    const content = `Look at ${link('img_a')} please\nstill this paragraph\n\nNext paragraph`;
    const segments = splitImageGenerationContent(content, [a]);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'images', 'text']);
    expect(segments[0]).toMatchObject({
        text: `Look at ${link('img_a')} please\nstill this paragraph`,
    });
    expect(segments[2]).toMatchObject({ text: 'Next paragraph' });
});

test('a links-only line under a heading line becomes a strip in place', () => {
    const d = imageGenerationFixture({ id: 'img_d' });
    const content = [
        'It works. Two prompts:',
        '',
        'Prompt #765 (left to right: A, B)',
        `${link('img_a')}${link('img_b')}`,
        '',
        'Prompt #766, same order:',
        `${link('img_c')} ${link('img_d')}`,
        '',
        'Once they finish, I will check them.',
    ].join('\n');
    const segments = splitImageGenerationContent(content, [a, b, c, d]);
    expect(segments.map((segment) => segment.kind)).toEqual([
        'text',
        'images',
        'text',
        'images',
        'text',
    ]);
    expect(segments[0]).toMatchObject({
        text: 'It works. Two prompts:\n\nPrompt #765 (left to right: A, B)',
    });
    expect(segments[1]).toMatchObject({ generations: [a, b] });
    expect(segments[2]).toMatchObject({ text: 'Prompt #766, same order:' });
    expect(segments[3]).toMatchObject({ generations: [c, d] });
});

test('links ending a sentence move into a strip below it', () => {
    const content = `Left to right: ${link('img_a')} ${link('img_b')}`;
    const segments = splitImageGenerationContent(content, [a, b]);
    expect(segments).toEqual([
        { key: 'text:0', kind: 'text', text: 'Left to right:' },
        { generations: [a, b], key: 'images:img_a', kind: 'images' },
    ]);
});

test('a list item of only links leaves no stray bullet', () => {
    const content = `Results:\n- ${link('img_a')}\n- ${link('img_b')}`;
    const segments = splitImageGenerationContent(content, [a, b]);
    expect(segments).toEqual([
        { key: 'text:0', kind: 'text', text: 'Results:' },
        { generations: [a, b], key: 'images:img_a', kind: 'images' },
    ]);
});

test('a generation linked twice renders one card', () => {
    const content = `${link('img_a')}\n\nagain ${link('img_a')}`;
    const segments = splitImageGenerationContent(content, [a]);
    expect(segments.map((segment) => segment.kind)).toEqual(['images', 'text']);
});

test('a link inside a code fence is not a card position', () => {
    const content = `\`\`\`\n${link('img_a')}\n\n${link('img_a')}\n\`\`\``;
    const segments = splitImageGenerationContent(content, [a]);
    expect(segments[0]).toMatchObject({ kind: 'text', text: content });
});
