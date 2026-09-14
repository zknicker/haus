import { readClerkSessionFixture, signInAsClerkHuman } from '../support/clerk-session.ts';
import { completeOnboarding, createClient } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const waitingCopy = 'The server owner is still setting up this server. Please check again later.';

test('fresh owner reload keeps a neutral frame until setup resolves and can switch Servers', async ({
    page,
}) => {
    const session = readClerkSessionFixture();
    const owner = createClient(session.token);
    await owner.server.create.mutate({ displayName: 'Opening demo', slug: 'opening-demo' });
    await signInAsClerkHuman(page);

    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/trpc/server.bySlug*', async (route) => {
        await pending;
        await route.continue();
    });
    await page.goto('/s/opening-demo');
    await expect(page.getByRole('status')).toHaveText('Opening Haus');
    await expect(page.getByText('Sign in to open your Haus.')).toHaveCount(0);
    const mark = page.locator('.activation-mark');
    const brand = page.locator('.activation-brand');
    const before = await brand.boundingBox();
    const ghost = await mark.elementHandle();
    if (!ghost) {
        throw new Error('The opening ghost must be mounted.');
    }
    const animationStarts = await ghost.evaluate((node) =>
        node.getAnimations({ subtree: true }).map((animation) => animation.startTime)
    );
    expect(animationStarts.length).toBeGreaterThan(0);
    release();
    await expect(page.getByRole('heading', { name: 'Connect a Computer' })).toBeVisible();
    expect(await brand.boundingBox()).toEqual(before);
    await expect(mark).toHaveCSS('animation-name', 'activation-mark-float');
    expect(
        await ghost.evaluate((node) => node === document.querySelector('.activation-mark'))
    ).toBe(true);
    expect(
        await ghost.evaluate((node) =>
            node.getAnimations({ subtree: true }).map((animation) => animation.startTime)
        )
    ).toEqual(animationStarts);
    await expect(
        page.getByText('Connect a Computer to run the Agents in Opening demo.')
    ).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/s\/opening-demo$/u);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Connect a Computer' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toHaveCount(0);
    const setupGhost = await mark.elementHandle();
    if (!setupGhost) {
        throw new Error('Setup must keep the ghost mounted.');
    }
    await page.getByRole('button', { name: 'Switch Server' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a Server' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Opening demo/ })).toBeVisible();
    expect(
        await setupGhost.evaluate((node) => node === document.querySelector('.activation-mark'))
    ).toBe(true);
    await page.getByRole('link', { name: /Opening demo/ }).click();
    await expect(page.getByRole('heading', { name: 'Connect a Computer' })).toBeVisible();
    expect(
        await setupGhost.evaluate((node) => node === document.querySelector('.activation-mark'))
    ).toBe(true);
});

for (const role of ['member', 'admin'] as const) {
    test(`${role} waits through reload and enters the intended destination when setup completes`, async ({
        page,
    }) => {
        const session = readClerkSessionFixture();
        const owner = createClient(session.token);
        const peer = createClient(session.peerToken);
        const slug = `waiting-${role}`;
        const created = await owner.server.create.mutate({ displayName: `Waiting ${role}`, slug });
        const invitation = await owner.invitation.create.mutate({
            email: session.peerEmail,
            serverId: created.id,
        });
        await signInAsClerkHuman(page, 'peer');
        await page.goto(`/invite/${invitation.token}`);
        await page.getByRole('button', { name: 'Accept invitation' }).click();
        await expect(page.getByText(waitingCopy)).toBeVisible();
        if (role === 'admin') {
            const member = await peer.server.bySlug.query({ slug });
            await owner.member.changeRole.mutate({
                confirmation: slug,
                role,
                serverId: created.id,
                userId: member.viewerUserId,
            });
        }
        await page.goto(`/s/${slug}/tasks`);
        await expect(page.getByText(waitingCopy)).toBeVisible();
        await page.reload();
        await expect(page.getByText(waitingCopy)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Connect a Computer' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toHaveCount(0);
        await expect(page.getByText(/install.sh/)).toHaveCount(0);
        await page.getByRole('button', { name: 'Choose another Server' }).click();
        await expect(page.getByRole('heading', { name: 'Choose a Server' })).toBeVisible();
        await page.goto(`/s/${slug}/tasks`);
        await expect(page.getByText(waitingCopy)).toBeVisible();
        // Deliberately omit an event: the real Server reconciliation read must unlock the page.
        completeOnboarding(session.databaseUrl, created.id);
        await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/s/${slug}/tasks$`, 'u'));
        // No Computer exists even after completion. This must not restart onboarding.
        await page.goto(`/s/${slug}`);
        await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
        await expect(page.getByText(waitingCopy)).toHaveCount(0);
    });
}

test('activation content uses a bounded entrance and respects reduced motion', async ({ page }) => {
    await page.goto('/prototype/activation/onboarding/preview-member');
    const step = page.locator('.activation-step');
    await expect(step).toBeVisible();
    await expect(step).toHaveCSS('animation-name', 'activation-content-in');
    await expect(step).toHaveCSS('animation-duration', '0.24s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(step).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.activation-mark')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.activation-brand')).toHaveCSS('transition-duration', '0s');
});
