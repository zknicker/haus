import { expect, test } from 'bun:test';
import {
    avatarMaxBytes,
    avatarTooLargeMessage,
    avatarUnsupportedMediaTypeMessage,
    formatAvatarMaxBytes,
} from '@haus/api/avatar';
import { assertAvatarFits, resolveAvatarMediaType } from './resize-avatar-image.ts';

const pngBytes = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    )
);

test('client size gate uses the shared avatarMaxBytes ceiling', () => {
    expect(() => assertAvatarFits(avatarMaxBytes)).not.toThrow();
    expect(() => assertAvatarFits(avatarMaxBytes + 1)).toThrow(avatarTooLargeMessage());
    expect(avatarTooLargeMessage()).toContain(formatAvatarMaxBytes(avatarMaxBytes));
    expect(() => assertAvatarFits(0)).toThrow(/could not be processed/i);
});

test('client media-type gate accepts the shared allowlist and refuses others', async () => {
    await expect(
        resolveAvatarMediaType(new File([pngBytes], 'portrait.png', { type: 'image/png' }))
    ).resolves.toBe('image/png');
    await expect(
        resolveAvatarMediaType(new File([pngBytes], 'portrait.jpg', { type: 'image/jpeg' }))
    ).resolves.toBe('image/jpeg');
    await expect(
        resolveAvatarMediaType(new File([pngBytes], 'portrait.gif', { type: 'image/gif' }))
    ).rejects.toThrow(avatarUnsupportedMediaTypeMessage());
    await expect(
        resolveAvatarMediaType(new File([pngBytes], 'portrait.svg', { type: 'image/svg+xml' }))
    ).rejects.toThrow(avatarUnsupportedMediaTypeMessage());
});

test('client recovers a missing declared type from PNG magic bytes', async () => {
    await expect(
        resolveAvatarMediaType(new File([pngBytes], 'portrait.bin', { type: '' }))
    ).resolves.toBe('image/png');
});
