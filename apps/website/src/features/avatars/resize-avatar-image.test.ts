import { expect, test } from 'bun:test';
import { readAvatarImage } from './resize-avatar-image.ts';

test('readAvatarImage rejects media types outside PNG, JPEG, and WebP', async () => {
    await expect(
        readAvatarImage(new File(['not-an-image'], 'notes.txt', { type: 'text/plain' }))
    ).rejects.toThrow('Choose a PNG, JPEG, or WebP image.');
});
