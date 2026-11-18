import { expect, test } from 'bun:test';
import { normalizeGeneratedAvatar } from './normalization.ts';
import { AvatarImageOutputError } from './service.ts';

const widePng = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfqCBoBEB7F0Ct7AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTA4LTI2VDAxOjE2OjMwKzAwOjAwb+ipNQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0wOC0yNlQwMToxNjozMCswMDowMB61EYkAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMDgtMjZUMDE6MTY6MzArMDA6MDBJoDBWAAAAGElEQVQI12P8z8Dwn4GBgYERQjEwMaABAFYpAwISmVtSAAAAAElFTkSuQmCC',
        'base64'
    )
);

test('center-crops provider PNG output and returns the ordinary square avatar size', () => {
    const normalized = normalizeGeneratedAvatar({ bytes: widePng, mediaType: 'image/png' });

    expect(normalized.mediaType).toBe('image/png');
    expect(normalized.width).toBe(256);
    expect(normalized.height).toBe(256);
    expect(normalized.bytes.byteLength).toBeLessThanOrEqual(512 * 1024);
    expect(normalized.bytes.subarray(0, 8)).toEqual(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
});

test('rejects provider output that is not a supported PNG', () => {
    expect(() =>
        normalizeGeneratedAvatar({
            bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
            mediaType: 'image/png',
        })
    ).toThrow(AvatarImageOutputError);
});
