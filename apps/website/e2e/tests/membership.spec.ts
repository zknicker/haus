import { createAppTestFixture, e2ePeerEmail, signInAsAppHuman } from '../support/app-session.ts';
import { createClient, openChannel, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

/**
 * The membership round trip in a real browser: an Owner invites, a second Haus user
 * identity accepts and lands in #all, the Owner promotes and then removes them,
 * and the removed human loses the Server. The last Owner stays protected
 * throughout.
 */
const slug = 'membership-hq';

test.beforeAll(async () => {
    const { accessToken } = await createAppTestFixture();
    await createAppTestFixture('peer');
    await createClient(accessToken).server.create.mutate({
        displayName: 'Membership HQ',
        slug,
    });
});

test('an Owner invites, promotes, and removes a human', async ({ browser, page }) => {
    const peerEmail = e2ePeerEmail;

    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/members/humans`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/members$`, 'u'));
    const rows = page.getByRole('grid', { name: 'Members' }).getByRole('row');

    // The sole Owner cannot strand the Server, and the menu says why.
    await rows
        .filter({ hasText: 'you' })
        .getByRole('button', { name: /^Actions for/u })
        .click();
    const leaveItem = page.getByRole('menuitem', { name: /Leave Server/u });
    await expect(leaveItem).toBeDisabled();
    await expect(leaveItem).toContainText(/last Owner/iu);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(peerEmail);
    await page.getByRole('dialog').getByRole('button', { name: 'Invite', exact: true }).click();

    const inviteLink = page.locator('code', { hasText: '/invite/' });
    await expect(inviteLink).toBeVisible();
    const invitePath = new URL((await inviteLink.innerText()).trim()).pathname;
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(rows.filter({ hasText: peerEmail })).toContainText(/pending/iu);

    // The invited human accepts in their own browser context.
    const peerContext = await browser.newContext();
    const peerPage = await peerContext.newPage();
    await signInAsAppHuman(peerPage, 'peer');
    await peerPage.goto(invitePath);
    await expect(peerPage.getByText(`You will join /${slug} as a member of #all.`)).toBeVisible();
    await peerPage.getByRole('button', { name: 'Accept invitation' }).click();

    await expect(peerPage).toHaveURL(new RegExp(`/s/${slug}/chats/[^/]+$`, 'u'));
    await expect(peerPage.getByRole('textbox', { name: 'Message all' })).toBeVisible();

    // A single-use token cannot be replayed.
    await peerPage.goto(invitePath);
    await expect(peerPage.getByText('Invitation unavailable')).toBeVisible();

    await page.reload();
    const memberRow = (role: string) => rows.filter({ has: page.getByText(role, { exact: true }) });
    const peerRow = memberRow('member');
    await expect(peerRow).toHaveCount(1);

    // Elevating a Member to Admin grants authority, so it takes the address too.
    await peerRow.getByRole('button', { name: /^Actions for/u }).click();
    await page.getByRole('menuitem', { name: 'Make Admin' }).click();
    const confirmPromotion = page.getByRole('button', { name: 'Make Admin' }).last();
    const addressField = page.getByLabel('Type the Server address to confirm');
    await expect(addressField).toBeVisible();
    await expect(confirmPromotion).toBeDisabled();
    await addressField.fill('nearly-right');
    await expect(confirmPromotion).toBeDisabled();
    await addressField.fill(slug);
    await expect(confirmPromotion).toBeEnabled();
    await confirmPromotion.click();
    await expect(memberRow('admin')).toHaveCount(1);

    // The dialog names the human and the role at stake, not just the verb.
    await memberRow('admin')
        .getByRole('button', { name: /^Actions for/u })
        .click();
    await page.getByRole('menuitem', { name: 'Make Member' }).click();
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
    await memberRow('admin')
        .getByRole('button', { name: /^Actions for/u })
        .click();
    await page.getByRole('menuitem', { name: 'Remove from Server' }).click();
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

    await expect(rows).toHaveCount(2);

    // Their open page drops the Server without being reloaded: losing access
    // arrives as a refused subscription, never as data, so the App has to act on
    // the refusal rather than wait for the next navigation.
    await expect(peerPage.getByRole('textbox', { name: 'Message all' })).toHaveCount(0);
    await expect(peerPage.getByText('Server Unavailable')).toBeVisible();

    // The already-open list loses it too. This proves membership-loss listening
    // belongs to the hosted route rather than only an open Server page.
    await expect(peerListPage.getByRole('link', { name: /Membership HQ/u })).toHaveCount(0);

    await peerContext.close();
});

test('a human outside the Server cannot reach its member management', async ({ page }) => {
    await signInAsAppHuman(page, 'peer');
    await page.goto(`/s/${slug}/members`);

    await expect(page.getByText('Server Unavailable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite', exact: true })).toHaveCount(0);
});
