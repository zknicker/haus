import { expect, test } from 'bun:test';
import { artifactTextMaxBytes } from '@haus/api';
import { artifactTextFromBytes } from './text.ts';

test('valid UTF-8 decodes to text, including multibyte characters', () => {
    const bytes = new TextEncoder().encode('naïve — 日本 ✓\n');
    expect(artifactTextFromBytes(bytes)).toEqual({ status: 'text', text: 'naïve — 日本 ✓\n' });
});

test('NUL bytes and invalid UTF-8 read as binary, never as replacement characters', () => {
    expect(artifactTextFromBytes(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0x00))).toEqual({
        status: 'binary',
    });
    expect(artifactTextFromBytes(Uint8Array.of(0x68, 0x69, 0xff, 0xfe))).toEqual({
        status: 'binary',
    });
});

test('bytes past the preview cap refuse to decode', () => {
    expect(artifactTextFromBytes(new Uint8Array(artifactTextMaxBytes + 1).fill(0x61))).toEqual({
        limit_bytes: artifactTextMaxBytes,
        status: 'too_large',
    });
});
