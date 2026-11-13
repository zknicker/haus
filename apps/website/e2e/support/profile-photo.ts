import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { expect } from './test.ts';

export const profilePhotoPath = fileURLToPath(
    new URL('../../public/prototypes/cove-avatar.png', import.meta.url)
);

const avatarSrcPattern = /\/api\/avatars\/(avt_[a-z0-9]{16})/u;

export async function uploadProfilePhoto(
    page: Page,
    photo: Locator,
    previousAvatarId?: string
): Promise<{ avatarId: string; src: string }> {
    const chooser = page.waitForEvent('filechooser');
    await photo.click();
    await (await chooser).setFiles(profilePhotoPath);
    const img = photo.locator('img');
    await expect(img).toBeVisible();
    await expect
        .poll(async () => {
            const src = (await img.getAttribute('src')) ?? '';
            const avatarId = avatarSrcPattern.exec(src)?.[1] ?? '';
            if (!avatarId) {
                return false;
            }
            return !previousAvatarId || avatarId !== previousAvatarId;
        })
        .toBe(true);
    const src = (await img.getAttribute('src')) ?? '';
    const avatarId = avatarSrcPattern.exec(src)?.[1] ?? '';
    expect(avatarId).toMatch(/^avt_[a-z0-9]{16}$/u);
    return { avatarId, src };
}
