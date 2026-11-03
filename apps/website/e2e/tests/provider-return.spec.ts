import { signInAsAppHuman } from '../support/app-session.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// Web provider returns (docs/features/browser-tabs.md): Linear's callback loads
// the App in the tab the install opened, which hands its page to the starting tab
// and closes. The desktop half lives in browser-tabs.spec.ts.

test("on the web, Linear's install return closes its tab and shows the outcome where it started", async ({
    context,
    page,
}) => {
    // Linear's authorize page never loads for real.
    await context.route('https://linear.app/**', (route) =>
        route.fulfill({ body: '<title>Linear</title>', contentType: 'text/html' })
    );
    const { server } = await createTestServer(page, {
        displayName: 'Provider return',
        slug: 'provider-return',
    });
    await page.goto(`/s/${server.slug}/settings/connections`);

    const opened = context.waitForEvent('page');
    await page.getByRole('button', { exact: true, name: 'Add Linear' }).click();
    const linear = await opened;
    await expect.poll(() => linear.url()).toContain('https://linear.app/');

    // Linear's callback redirects the install tab back to Settings with the outcome.
    // The same AppSession signs the landing in like the starting tab.
    await signInAsAppHuman(linear);
    const closed = linear.waitForEvent('close');
    await linear.goto(`/s/${server.slug}/settings/connections?linear_setup=linear_denied`);
    await closed;
    await expect(page.getByText('Install canceled')).toBeVisible();
    await expect(page).toHaveURL(/linear_setup=linear_denied/u);
});

test('a landing no tab is waiting for keeps showing its outcome', async ({ page }) => {
    const { server } = await createTestServer(page, {
        displayName: 'Provider landing',
        slug: 'provider-landing',
    });
    await page.goto(`/s/${server.slug}/settings/connections?linear_setup=linear_denied`);
    await expect(page.getByText('Install canceled')).toBeVisible();
    // Past the claim window, the page is still here.
    await page.waitForTimeout(2000);
    await expect(page.getByText('Install canceled')).toBeVisible();
});
