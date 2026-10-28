import { expect, test } from 'bun:test';
import {
    avatarAcceptedTypesLabel,
    avatarBase64MaxLength,
    avatarBytesInputSchema,
    avatarMaxBytes,
    avatarMediaTypeSchema,
    avatarMediaTypes,
    avatarPixelSize,
    avatarTooLargeMessage,
    avatarUnsupportedMediaTypeMessage,
    avatarUploadHint,
    formatAvatarMaxBytes,
    isAvatarMediaType,
} from './avatar.ts';

test('pins the shared avatar upload ceiling and media allowlist', () => {
    expect(avatarMaxBytes).toBe(512 * 1024);
    expect(formatAvatarMaxBytes()).toBe('512 KiB');
    expect(avatarPixelSize).toBe(256);
    expect(avatarMediaTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(avatarAcceptedTypesLabel).toBe('JPEG, PNG, or WebP');
    expect(avatarUploadHint()).toContain('512 KiB');
    expect(avatarUploadHint()).toContain('256×256');
});

test('base64 length ceiling tracks avatarMaxBytes so client and server cannot drift', () => {
    expect(avatarBase64MaxLength).toBe(4 * Math.ceil(avatarMaxBytes / 3));

    const atCap = 'A'.repeat(avatarBase64MaxLength);
    expect(
        avatarBytesInputSchema.safeParse({ bytesBase64: atCap, mediaType: 'image/png' }).success
    ).toBe(true);

    const overCap = 'A'.repeat(avatarBase64MaxLength + 1);
    expect(
        avatarBytesInputSchema.safeParse({ bytesBase64: overCap, mediaType: 'image/png' }).success
    ).toBe(false);
});

test('rejects media types outside the shared avatar allowlist', () => {
    expect(isAvatarMediaType('image/png')).toBe(true);
    expect(isAvatarMediaType('image/gif')).toBe(false);
    expect(isAvatarMediaType('image/svg+xml')).toBe(false);
    expect(isAvatarMediaType('application/octet-stream')).toBe(false);
    expect(avatarMediaTypeSchema.safeParse('image/webp').success).toBe(true);
    expect(avatarMediaTypeSchema.safeParse('image/gif').success).toBe(false);
    expect(
        avatarBytesInputSchema.safeParse({ bytesBase64: 'AAAA', mediaType: 'image/gif' }).success
    ).toBe(false);
    expect(avatarUnsupportedMediaTypeMessage()).toContain(avatarAcceptedTypesLabel);
    expect(avatarTooLargeMessage()).toContain(formatAvatarMaxBytes());
});
