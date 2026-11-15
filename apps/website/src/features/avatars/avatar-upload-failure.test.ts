import { expect, test } from 'bun:test';
import { avatarTooLargeMessage, avatarUnsupportedMediaTypeMessage } from '@haus/api/avatar';
import { assertAvatarFits, resolveAvatarMediaType } from './resize-avatar-image.ts';

test('unsupported type failure copy is what the picker surfaces via onError', async () => {
    await expect(
        resolveAvatarMediaType(
            new File([new Uint8Array([0x47, 0x49, 0x46])], 'meme.gif', { type: 'image/gif' })
        )
    ).rejects.toThrow(avatarUnsupportedMediaTypeMessage());
});

test('oversize failure copy is what the picker surfaces via onError', () => {
    expect(() => assertAvatarFits(512 * 1024 + 1)).toThrow(avatarTooLargeMessage());
    expect(() => assertAvatarFits(512 * 1024 + 1)).toThrow(/Choose a simpler photo/u);
});
