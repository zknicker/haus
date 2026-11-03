import { createAppTestFixture, e2ePeerEmail, signInAsAppHuman } from '../support/app-session.ts';
import { completeOnboarding, createClient, openChannel, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

/**
 * The membership round trip in a real browser: an Owner invites, a second Haus user
 * identity accepts and lands in #all, the Owner promotes and then removes them,
 * and the removed human loses the Server. The last Owner stays protected
 * throughout.
 */
const slug = 'membership-hq';

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    await createAppTestFixture('peer');
    const created = await createClient(accessToken).server.create.mutate({
        displayName: 'Membership HQ',
        slug,
    });
    completeOnboarding(databaseUrl, created.id);
});

test('an Owner invites, promotes, and removes a human', async ({ browser, page }) => {
    const peerEmail = e2ePeerEmail;

    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/members/humans`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/members/humans$`, 'u'));

    // The sole Owner cannot strand the Server, and the row says why.
    const leaveButton = page.getByRole('button', { name: 'Leave Server' });
    await expect(leaveButton).toBeDisabled();
    await expect(leaveButton.locator('..')).toHaveAttribute('title', /last Owner/iu);

    await page.getByRole('button', { name: 'Invite by email' }).click();
    await page.getByLabel('Email', { exact: true }).fill(peerEmail);
    await page.getByRole('button', { name: 'Invite', exact: true }).click();

    const inviteLink = page.locator('code', { hasText: '/invite/' });
    await expect(inviteLink).toBeVisible();
    const invitePath = new URL((await inviteLink.innerText()).trim()).pathname;
    const invitationRow = page.locator('[data-invitation-id]').filter({ hasText: peerEmail });
    await expect(invitationRow).toContainText('Pending');

    // The invited human accepts in their own browser context.
    const peerContext = await browser.newContext();
    const peerPage = await peerContext.newPage();
    await signInAsAppHuman(peerPage, 'peer');
    await peerPage.goto(invitePath);
    await peerPage.getByRole('button', { name: 'Accept invitation' }).click();

    await expect(peerPage).toHaveURL(new RegExp(`/s/${slug}/chats/[^/]+$`, 'u'));
    await expect(peerPage.getByRole('textbox', { name: 'Message all' })).toBeVisible();

    // A single-use token cannot be replayed.
    await peerPage.goto(invitePath);
    await expect(peerPage.getByText('Invitation unavailable')).toBeVisible();

    await page.reload();
    const peerRow = page.locator('[data-member-id]').filter({ hasText: 'member' });
    await expect(peerRow).toHaveCount(1);

    // Elevating a Member to Admin grants authority, so it takes the address too.
    await peerRow.getByRole('button', { name: 'Make Admin' }).click();
    const confirmPromotion = page.getByRole('button', { name: 'Make Admin' }).last();
    const addressField = page.getByLabel('Type the Server address to confirm');
    await expect(addressField).toBeVisible();
    await expect(confirmPromotion).toBeDisabled();
    await addressField.fill('nearly-right');
    await expect(confirmPromotion).toBeDisabled();
    await addressField.fill(slug);
    await expect(confirmPromotion).toBeEnabled();
    await confirmPromotion.click();
    await expect(page.locator('[data-member-id]').filter({ hasText: 'admin' })).toHaveCount(1);

    // The dialog names the human and the role at stake, not just the verb.
    const adminRowForDemotion = page.locator('[data-member-id]').filter({ hasText: 'admin' });
    await adminRowForDemotion.getByRole('button', { name: 'Make Member' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Make Member' })).toContainText(
        'goes from admin to member'
    );
    // Stepping down grants nothing, so it stays an ordinary confirmation.
    await expect(page.getByLabel('Type the Server address to confirm')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // The removed human is sitting on the Server with its transcript rendered.
    await peerPage.goto(`/s/${slug}`);
    await openSection(peerPage, 'Chat');
    await openChannel(peerPage, 'all');
    await expect(peerPage.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    const peerListPage = await peerContext.newPage();
    await signInAsAppHuman(peerListPage, 'peer');
    // Settings > Servers is where switching lives now, so that list is what a
    // second open page holds while membership changes underneath it.
    await peerListPage.goto(`/s/${slug}/settings/servers`);
    await expect(peerListPage.getByRole('link', { name: /Membership HQ/u })).toBeVisible();

    // Removal is destructive, so it takes the exact Server address.
    const adminRow = page.locator('[data-member-id]').filter({ hasText: 'admin' });
    await adminRow.getByRole('button', { name: 'Remove from Server' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Remove from Server' })).toContainText(
        'is currently admin'
    );
    const confirm = page.getByRole('button', { name: 'Remove from Server' }).last();
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Type the Server address to confirm').fill('wrong');
    await expect(confirm).toBeDisabled();
    await page.getByLabel('Type the Server address to confirm').fill(slug);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.locator('[data-member-id]')).toHaveCount(1);

    // Their open page drops the Server without being reloaded: losing access
    // arrives as a refused subscription, never as data, so the App has to act on
    // the refusal rather than wait for the next navigation.
    await expect(peerPage.getByRole('textbox', { name: 'Message all' })).toHaveCount(0);
    await expect(peerPage.getByText('Server unavailable')).toBeVisible();

    // The already-open list loses it too. This proves membership-loss listening
    // belongs to the hosted route rather than only an open Server page.
    await expect(peerListPage.getByRole('link', { name: /Membership HQ/u })).toHaveCount(0);

    await peerContext.close();
});

test('a human outside the Server cannot reach its member management', async ({ page }) => {
    await signInAsAppHuman(page, 'peer');
    await page.goto(`/s/${slug}/members`);

    await expect(page.getByText('Server unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite by email' })).toHaveCount(0);
});
