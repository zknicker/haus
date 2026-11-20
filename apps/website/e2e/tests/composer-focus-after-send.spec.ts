import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { completeOnboarding, createClient, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

/**
 * Clicking Send must leave the person in the composer so the next message is
 * ready. Chromium and WebKit (Safari) both lose that focus when the Send
 * button takes it and then disables; this contract covers both engines.
 */
for (const browserName of ['chromium', 'webkit'] as const) {
    test.describe(`composer focus after send (${browserName})`, () => {
        test.use({ browserName });

        test('Send keeps the composer focused for the next message', async ({ page }) => {
            test.setTimeout(60_000);
            const { accessToken, databaseUrl } = await createAppTestFixture();
            const client = createClient(accessToken);
            const server = await client.server.create.mutate({
                displayName: 'Composer Focus',
                slug: `composer-focus-${browserName}`,
            });
            completeOnboarding(databaseUrl, server.id);
            const channelName = server.channels[0]?.name ?? 'haus';

            await signInAsAppHuman(page);
            await page.goto(`/s/composer-focus-${browserName}`);
            await openChannel(page, channelName);

            const composer = page
                .locator('.prompt-input')
                .filter({ visible: true })
                .getByRole('textbox');
            await composer.fill('First of two quick sends');
            await expect(composer).toBeFocused();
            await page.getByRole('button', { name: 'Send', exact: true }).click();
            await expect(page.getByText('First of two quick sends', { exact: true })).toBeVisible();
            await expect(composer).toBeFocused();
            await expect(composer).toHaveText('');

            await composer.fill('Second send without clicking back in');
            await page.keyboard.press('Enter');
            await expect(
                page.getByText('Second send without clicking back in', { exact: true })
            ).toBeVisible();
            await expect(composer).toBeFocused();
        });
    });
}
