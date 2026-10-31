import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { uploadProfilePhoto } from '../support/profile-photo.ts';
import { assertOpaqueId, completeOnboarding, createClient, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'settings-avatar-hq';
let viewerUserId: string;

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Settings Avatar HQ', slug });
    const server = await owner.server.bySlug.query({ slug });
    completeOnboarding(databaseUrl, server.id);
    const ownerUserId = runPsql(databaseUrl, "select id from users where id = 'usr_e2e_human'");
    assertOpaqueId(ownerUserId);
    viewerUserId = ownerUserId;
    runPsql(
        databaseUrl,
        `update users set display_name = 'Zach Knickerbocker', avatar_id = null where id = '${ownerUserId}'`
    );
});

test('uploads a profile photo, serves it from the avatar API, and replaces it on re-upload', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);

    const photo = page.getByRole('button', { name: /profile photo/u });
    const first = await uploadProfilePhoto(page, photo);
    const firstResponse = await page.request.get(first.src);
    expect(firstResponse.ok()).toBe(true);
    expect(firstResponse.headers()['content-type']).toMatch(/^image\/png/u);

    const second = await uploadProfilePhoto(page, photo, first.avatarId);
    expect(second.avatarId).not.toBe(first.avatarId);

    await page.goto(`/s/${slug}/settings/members/humans/${viewerUserId}`);
    await expect(
        page.getByRole('button', { name: /profile photo/u }).locator('img')
    ).toHaveAttribute('src', new RegExp(`/api/avatars/${second.avatarId}$`, 'u'));
});
