import { expect, test } from 'bun:test';
import {
    extensionMediaType,
    inferAttachmentMediaType,
    resolveAttachmentMediaType,
    sniffMediaType,
} from './attachment-media-type.ts';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);
const withBom = (value: string) => Uint8Array.from([0xef, 0xbb, 0xbf, ...text(value)]);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
const ftyp = (brand: string) =>
    text(`\u0000\u0000\u0000\u0018ftyp${brand}\u0000\u0000\u0000\u0000`);

test('sniffs image signatures', () => {
    expect(sniffMediaType(png)).toBe('image/png');
    expect(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffMediaType(text('GIF89a...'))).toBe('image/gif');
    expect(sniffMediaType(text('GIF87a...'))).toBe('image/gif');
    expect(sniffMediaType(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffMediaType(ftyp('avif'))).toBe('image/avif');
    expect(sniffMediaType(ftyp('heic'))).toBe('image/heic');
    expect(sniffMediaType(ftyp('mif1'))).toBe('image/heif');
    expect(sniffMediaType(bytes(0x49, 0x49, 0x2a, 0x00, 8))).toBe('image/tiff');
    expect(sniffMediaType(bytes(0x4d, 0x4d, 0x00, 0x2a, 0))).toBe('image/tiff');
    expect(sniffMediaType(bytes(0x42, 0x4d, 1, 2, 3, 4, 0, 0, 0, 0, 54, 0, 0, 0))).toBe(
        'image/bmp'
    );
    expect(sniffMediaType(bytes(0, 0, 1, 0, 1, 0))).toBe('image/x-icon');
});

test('sniffs document, archive, audio, and video signatures', () => {
    expect(sniffMediaType(text('%PDF-1.7\n'))).toBe('application/pdf');
    expect(sniffMediaType(bytes(0x50, 0x4b, 0x03, 0x04))).toBe('application/zip');
    expect(sniffMediaType(bytes(0x1f, 0x8b, 8))).toBe('application/gzip');
    expect(sniffMediaType(text('ID3\u0004'))).toBe('audio/mpeg');
    expect(sniffMediaType(text('OggS\u0000'))).toBe('audio/ogg');
    expect(sniffMediaType(text('fLaC'))).toBe('audio/flac');
    expect(sniffMediaType(text('RIFF\u0000\u0000\u0000\u0000WAVEfmt '))).toBe('audio/wav');
    expect(sniffMediaType(ftyp('isom'))).toBe('video/mp4');
    expect(sniffMediaType(ftyp('qt  '))).toBe('video/quicktime');
    expect(sniffMediaType(ftyp('M4A '))).toBe('audio/mp4');
    expect(sniffMediaType(bytes(0x1a, 0x45, 0xdf, 0xa3, ...text('....webm')))).toBe('video/webm');
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
    expect(sniffMediaType(text('BM plain text that is not a bitmap'))).toBeNull();
    expect(sniffMediaType(ftyp('zzzz'))).toBeNull();
    expect(sniffMediaType(new Uint8Array())).toBeNull();
});

test('a generic declared type takes the content, then the extension', () => {
    for (const declared of ['', 'application/octet-stream', null, 'Application/Octet-Stream']) {
        expect(resolveAttachmentMediaType({ declared, filename: 'paste', head: png })).toBe(
            'image/png'
        );
    }
    expect(
        resolveAttachmentMediaType({ declared: '', filename: 'notes.md', head: text('# hi') })
    ).toBe('text/markdown');
    expect(
        resolveAttachmentMediaType({ declared: '', filename: 'blob', head: bytes(1, 2, 3) })
    ).toBe('application/octet-stream');
});

test('a ZIP signature defers to a more specific extension', () => {
    const zip = bytes(0x50, 0x4b, 0x03, 0x04);
    expect(resolveAttachmentMediaType({ declared: '', filename: 'deck.pptx', head: zip })).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    expect(resolveAttachmentMediaType({ declared: '', filename: 'bundle', head: zip })).toBe(
        'application/zip'
    );
});

test('a declared image type the bytes contradict takes the bytes', () => {
    expect(
        resolveAttachmentMediaType({ declared: 'image/jpeg', filename: 'a.jpg', head: png })
    ).toBe('image/png');
    expect(
        resolveAttachmentMediaType({
            declared: 'image/png',
            filename: 'a.png',
            head: text('%PDF-1.4'),
        })
    ).toBe('application/pdf');
    // Unrecognized bytes never overrule a specific declared type.
    expect(
        resolveAttachmentMediaType({ declared: 'image/heic', filename: 'a', head: bytes(1, 2) })
    ).toBe('image/heic');
    expect(
        resolveAttachmentMediaType({
            declared: 'text/csv; charset=utf-8',
            filename: 'a',
            head: png,
        })
    ).toBe('text/csv');
});

test('the extension table covers paths and common formats', () => {
    expect(extensionMediaType('notes/Report.CSV')).toBe('text/csv');
    expect(extensionMediaType('photo.HEIC')).toBe('image/heic');
    expect(extensionMediaType('.hidden')).toBeNull();
    expect(extensionMediaType('dir.v2/no-extension')).toBeNull();
    expect(inferAttachmentMediaType('/tmp/out.jpg', png)).toBe('image/png');
    expect(inferAttachmentMediaType('clip.mp4', bytes(0, 0, 0, 0x18))).toBe('video/mp4');
    expect(inferAttachmentMediaType('blob.bin', bytes(1, 2, 3))).toBe('application/octet-stream');
});
