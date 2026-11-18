import { expect, test } from 'bun:test';
import { formatByteSize } from './format.ts';

test('a byte count reads in the unit a person would say it in', () => {
    expect(formatByteSize(0)).toBe('0 bytes');
    expect(formatByteSize(1)).toBe('1 byte');
    expect(formatByteSize(512)).toBe('512 bytes');
    expect(formatByteSize(1536)).toBe('1.5 KB');
    expect(formatByteSize(65_536)).toBe('64 KB');
});
