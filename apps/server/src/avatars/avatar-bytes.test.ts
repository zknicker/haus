import { expect, test } from 'bun:test';
import { avatarMaxBytes, avatarTooLargeMessage, formatAvatarMaxBytes } from '@haus/api/avatar';
import { readAvatarBytes } from './avatar-bytes.ts';
import { AvatarRejectedError } from './avatar-errors.ts';

const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('accepts a valid PNG under the shared avatarMaxBytes ceiling', () => {
    const decoded = readAvatarBytes(pngBase64, 'image/png');
    expect(decoded.bytes.byteLength).toBeGreaterThan(0);
    expect(decoded.bytes.byteLength).toBeLessThanOrEqual(avatarMaxBytes);
    expect(decoded.sha256).toMatch(/^[a-f0-9]{64}$/u);
});

test('refuses bytes that exceed avatarMaxBytes with the shared size message', () => {
    const oversized = Buffer.alloc(avatarMaxBytes + 1);
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(() => readAvatarBytes(oversized.toString('base64'), 'image/png')).toThrow(
        AvatarRejectedError
    );
    expect(() => readAvatarBytes(oversized.toString('base64'), 'image/png')).toThrow(
        avatarTooLargeMessage()
    );
    expect(avatarTooLargeMessage()).toContain(formatAvatarMaxBytes(avatarMaxBytes));
});

test('refuses a declared media type that the magic bytes contradict', () => {
    expect(() => readAvatarBytes(pngBase64, 'image/jpeg')).toThrow(/not a JPEG image/i);
    expect(() => readAvatarBytes(pngBase64, 'image/webp')).toThrow(/not a WEBP image/i);
});

test('refuses empty decoded payloads', () => {
    expect(() => readAvatarBytes('', 'image/png')).toThrow(/cannot be empty/i);
});
