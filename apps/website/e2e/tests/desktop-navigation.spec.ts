import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { createTestServer, openSection, openSettings } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('the sidebar goes in the left pane, pages open on the right, and Settings is a page in its tab', async ({
    page,
}) => {
    await installDesktopBrowserStub(page);
    const { server, session } = await createTestServer(page, {
        displayName: 'Desktop navigation',
        slug: 'desktop-navigation',
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: server.slug,
        token: session.accessToken,
    });
    const originId = await agent.send('Navigation task origin', 'navigation-task-origin');
    const title = 'Navigation task';
    const { shortId: key } = await agent.startTask({ from: originId, title });
    await openDesktopWindow(page, `/s/${server.slug}/chats/${agent.chatId}`);
    const left = tabRow(page, 'Left pane tabs').locator('.workspace-tab');
    const right = tabRow(page, 'Right pane tabs').locator('.workspace-tab');
    const openTask = page
        .locator('.desktop-tab-frame[data-frame-pane="primary"]:visible')
        .getByRole('button', { name: new RegExp(`^Open task ${title},`, 'u') });

    await openTask.click();
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText(key);

    // Go: with the right pane focused, a sidebar row still navigates the left pane's tab.
    await openSection(page, 'Tasks');
    await expect(left).toHaveCount(1);
    await expect(left.first()).toContainText('Tasks');
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText(key);

    // Back undoes Go in the left tab.
    await page.evaluate(() => window.dispatchEvent(new Event('test:desktop-history')));
    await expect(left.first()).toContainText('all');

    // Modifiers open beside the source in its own pane, never on the right: Command-click
    // and middle-click a background tab, each after the last.
    await openTask.click({ modifiers: ['Meta'] });
    await expect(left).toHaveCount(2);
    await expect(left.nth(0)).toHaveAttribute('data-active', 'true');
    await expect(left.nth(1)).toContainText(key);
    await openTask.click({ button: 'middle' });
    await expect(left).toHaveCount(3);
    await expect(left.nth(0)).toHaveAttribute('data-active', 'true');
    await expect(right).toHaveCount(1);

    // Settings is a page, as in Capy: the Account menu pushes it onto the left pane's tab…
    await openSettings(page);
    await expect(left).toHaveCount(3);
    await expect(left.nth(0)).toContainText('Profile');
    await expect(left.nth(0)).toHaveAttribute('data-active', 'true');
    // …and its "← Settings" row steps that tab back to the page before Settings.
    await page.getByRole('row', { exact: true, name: 'Back to chat' }).click();
    await expect(left.nth(0)).not.toContainText('Profile');
    await expect(left).toHaveCount(3);
    await openSettings(page);
    await expect(left.nth(0)).toContainText('Profile');

    // The Settings rail is the Settings page's own drill-down: with Settings in the right
    // pane, a rail section pushes in that tab and never Goes in the left pane.
    await left.filter({ hasText: 'Profile' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to right pane' }).click();
    await expect(right).toHaveCount(2);
    // Focusing it puts its rail in the sidebar.
    await right
        .filter({ hasText: 'Profile' })
        .getByRole('button', { exact: true, name: 'Profile' })
        .click();
    const leftBefore = await left.allTextContents();
    await page.getByRole('row', { exact: true, name: 'Members' }).click();
    await expect(
        page.locator('.desktop-tab-frame[data-frame-pane="secondary"]:visible')
    ).toContainText('Members');
    await expect(right).toHaveCount(2);
    expect(await left.allTextContents()).toEqual(leftBefore);
});

function tabRow(page: Page, name: string) {
    return page.getByRole('navigation', { exact: true, name });
}
