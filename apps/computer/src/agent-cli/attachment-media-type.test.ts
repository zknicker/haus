import { expect, test } from 'bun:test';
import { inferAttachmentMediaType, sniffMediaType } from './attachment-media-type.ts';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);
const withBom = (value: string) => Uint8Array.from([0xef, 0xbb, 0xbf, ...text(value)]);

test('sniffs image and PDF signatures', () => {
    expect(sniffMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
        'image/png'
    );
    expect(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffMediaType(text('GIF89a...'))).toBe('image/gif');
    expect(sniffMediaType(text('GIF87a...'))).toBe('image/gif');
    expect(sniffMediaType(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffMediaType(text('%PDF-1.7\n'))).toBe('application/pdf');
});

test('sniffs SVG text behind a declaration, comment, and doctype', () => {
    expect(sniffMediaType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml');
    expect(
        sniffMediaType(
            withBom('<?xml version="1.0"?>\n<!-- made by hand -->\n<!DOCTYPE svg>\n<svg>\n</svg>')
        )
    ).toBe('image/svg+xml');
    expect(sniffMediaType(text('<svgish/>'))).toBeNull();
    expect(sniffMediaType(text('<html><svg></svg></html>'))).toBeNull();
});

test('rejects truncated and unknown content', () => {
    expect(sniffMediaType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(sniffMediaType(text('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBeNull();
    expect(sniffMediaType(new Uint8Array())).toBeNull();
});

test('content wins over a wrong extension', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(inferAttachmentMediaType('/tmp/out.jpg', png)).toBe('image/png');
    expect(inferAttachmentMediaType('/tmp/ig_0abc', png)).toBe('image/png');
});

test('falls back to the extension, then octet-stream', () => {
    expect(inferAttachmentMediaType('notes/Report.CSV', text('a,b\n1,2'))).toBe('text/csv');
    expect(inferAttachmentMediaType('clip.mp4', bytes(0, 0, 0, 0x18))).toBe('video/mp4');
    expect(inferAttachmentMediaType('blob.bin', bytes(1, 2, 3))).toBe('application/octet-stream');
    expect(inferAttachmentMediaType('no-extension', bytes(1, 2, 3))).toBe(
        'application/octet-stream'
    );
});
