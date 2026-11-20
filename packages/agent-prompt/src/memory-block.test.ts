import { expect, test } from 'bun:test';
import { formatMemoryBlock, memoryCharacterCap } from './memory-block.ts';

test('a file over the cap is cut at a line boundary with a notice naming its size and the cap', () => {
    const line = `${'x'.repeat(99)}\n`;
    const content = line.repeat(100);
    const block = formatMemoryBlock(content);
    const body = block.split('\n').filter((entry) => entry === 'x'.repeat(99));
    expect(body).toHaveLength(80);
    expect(body.join('\n').length).toBeLessThanOrEqual(memoryCharacterCap);
    expect(block).toContain(
        '[MEMORY.md is 9,999 characters, over the 8,000-character cap, so Haus cut it at the last full line above. Tighten MEMORY.md under 8,000 characters'
    );
});

test('a line ending exactly at the cap is kept whole', () => {
    const block = formatMemoryBlock(
        `${'x'.repeat(3999)}\n${'y'.repeat(4000)}\n${'z'.repeat(10)}\n`
    );
    expect(block).toContain('y'.repeat(4000));
    expect(block).not.toContain('zzz');
    expect(block).toContain('-character cap');
});

test('a file within the cap is delivered whole with no notice', () => {
    const block = formatMemoryBlock('# Kit\n\n## Role\nRelease manager.\n');
    expect(block).toContain('## Role\nRelease manager.\n</haus-memory>');
    expect(block).not.toContain('-character cap');
});
