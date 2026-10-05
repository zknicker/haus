import type { Locator, Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import {
    installDesktopBrowserStub,
    moveTabToRightPane,
    openDesktopWindow,
} from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, openChannel, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('the sidebar navigates the current tab, Back returns, and Command-click opens a background tab', async ({
    page,
}) => {
    await installDesktopBrowserStub(page);
    const { server } = await createTestServer(page, {
        displayName: 'Desktop tabs',
        slug: 'desktop-tabs-nav',
    });
    await openDesktopWindow(page, `/s/${server.slug}`);
    const tabs = tabRow(page, 'Tabs').locator('.workspace-tab');
    await expect(tabs).toHaveCount(1);

    // The sidebar navigates the one tab rather than opening another.
    await openChannel(page, 'all');
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    await expect(tabs).toHaveCount(1);
    await expect(tabs).toContainText('all');
    await openSection(page, 'Tasks');
    await expect(tabs).toHaveCount(1);
    await expect(tabs).toContainText('Tasks');

    // Back (⌘[, the Go menu) walks the tab's own history.
    await desktopEvent(page, 'test:desktop-history');
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    await expect(tabs).toContainText('all');

    // Command-click on a sidebar row opens a background tab after the current one.
    await page.getByRole('row', { exact: true, name: 'Tasks' }).click({ modifiers: ['Meta'] });
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toContainText('all');
    await expect(tabs.nth(1)).toContainText('Tasks');
    await expect(tabs.nth(0)).toHaveAttribute('data-active', 'true');
    await expect(tabs.nth(1)).not.toHaveAttribute('data-active', 'true');
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();

    // Command-Shift-click opens a selected tab; ⌘W closes it back to the background one.
    await page
        .getByRole('row', { exact: true, name: 'Inbox' })
        .click({ modifiers: ['Meta', 'Shift'] });
    await expect(tabs).toHaveCount(3);
    // After the opener's earlier background tab, as in Chrome.
    await expect(tabs.nth(2)).toContainText('Inbox');
    await expect(tabs.nth(2)).toHaveAttribute('data-active', 'true');
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeHidden();
    await desktopEvent(page, 'test:desktop-close');
    await expect(tabs).toHaveCount(2);
    await tabs.nth(1).getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(tabs.nth(1)).toHaveAttribute('data-active', 'true');

    // ⌘W closes the current tab; ⌘⇧T reopens it with its history.
    await desktopEvent(page, 'test:desktop-close');
    await expect(tabs).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('test:desktop-shortcut', { detail: 'reopen-tab' }))
    );
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toContainText('Tasks');

    // Tabs, their order, and their histories survive a reload.
    await page.reload();
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('data-active', 'true');
    await tabs.nth(0).getByRole('button', { name: 'all', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    await desktopEvent(page, 'test:desktop-history');
    await expect(tabs.nth(0)).not.toContainText('all');

    // Closing the window's last tab closes the window.
    await desktopEvent(page, 'test:desktop-close');
    await desktopEvent(page, 'test:desktop-close');
    await expect(page.locator('html')).toHaveAttribute('data-window-closed', 'true');
});

test('panes: one pane keeps links in the tab, Move to right pane splits, links then open in the other pane, and an empty pane closes', async ({
    page,
}) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Desktop panes',
        slug: 'desktop-tabs-panes',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    const root = await client.chat.send.mutate({
        serverId: server.id,
        chatId,
        nonce: 'pane-thread-root',
        content: 'Pane thread root',
    });
    await client.chat.send.mutate({
        serverId: server.id,
        chatId,
        nonce: 'pane-thread-reply',
        content: 'Pane thread reply',
        thread: { anchorMessageId: root.message.id },
    });
    await openDesktopWindow(page, `/s/${server.slug}/chats/${chatId}`);
    const left = tabRow(page, 'Left pane tabs').locator('.workspace-tab');
    const right = tabRow(page, 'Right pane tabs').locator('.workspace-tab');
    const composer = page.getByRole('textbox', { name: 'Message all' });

    const tabs = tabRow(page, 'Tabs').locator('.workspace-tab');

    // With one pane, a Thread link navigates the current tab; Back returns to the chat.
    await page.getByRole('button', { name: 'Open thread, 1 reply' }).click();
    await expect(tabs).toHaveCount(1);
    await expect(tabs).toContainText('Pane thread root');
    await expect(tabRow(page, 'Right pane tabs')).toHaveCount(0);
    await desktopEvent(page, 'test:desktop-history');
    await expect(composer).toBeVisible();

    // Move to right pane on a second tab opens the second pane with it.
    await page.getByRole('row', { exact: true, name: 'Inbox' }).click({ modifiers: ['Meta'] });
    await expect(tabs).toHaveCount(2);
    await moveTabToRightPane(page, 'Inbox');
    await expect(left).toHaveCount(1);
    await expect(right).toHaveCount(1);
    await expect(right).toContainText('Inbox');

    // With two panes, a Thread link from the chat opens in the other pane.
    await paneBody(page, 'primary').getByRole('button', { name: 'Open thread, 1 reply' }).click();
    await expect(right).toHaveCount(1);
    await expect(right).toContainText('Pane thread root');
    await expect(paneBody(page, 'secondary').getByText('Pane thread reply')).toBeVisible();
    await expect(composer).toBeVisible();

    // The same link again selects that tab instead of duplicating it.
    await paneBody(page, 'primary').getByRole('button', { name: 'Open thread, 1 reply' }).click();
    await expect(right).toHaveCount(1);

    // Dragging the right pane's only tab onto the left row moves it and closes the right pane.
    await dragTab(page, right.first(), left.first());
    await expect(tabRow(page, 'Right pane tabs')).toHaveCount(0);
    const only = tabRow(page, 'Tabs').locator('.workspace-tab');
    await expect(only).toHaveCount(2);

    // There is no body edge drop target (ADR 0039): Move to right pane opens the second pane.
    await moveTabToRightPane(page, 'Pane thread root');
    await expect(right).toHaveCount(1);
    await expect(right).toContainText('Pane thread root');

    // Closing a pane's last tab closes the pane, leaving one full-width pane.
    await right
        .first()
        .getByRole('button', { name: /^Close /u })
        .click();
    await expect(tabRow(page, 'Right pane tabs')).toHaveCount(0);
    await expect(tabRow(page, 'Tabs').locator('.workspace-tab')).toHaveCount(1);
    await expect(composer).toBeVisible();
});

test('a hidden chat tab keeps its draft and leaves its unread alone', async ({ page }) => {
    await installDesktopBrowserStub(page);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Hidden tabs',
        slug: 'desktop-tabs-hidden',
    });
    await client.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId: server.id,
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: server.slug,
        token: session.token,
    });
    await openDesktopWindow(page, `/s/${server.slug}`);
    await openChannel(page, 'all');
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill('Keep this draft');
    const tabs = tabRow(page, 'Tabs').locator('.workspace-tab');

    // A selected new tab on the Inbox (Shift-click) hides the chat's tab.
    await page.getByRole('row', { exact: true, name: 'Inbox' }).click({ modifiers: ['Shift'] });
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(composer).toBeHidden();

    // Activity in the hidden chat stays unread while its tab is hidden.
    await agent.send(`[@Ada](user://${agent.ownerUserId}) Ready when you are.`, 'hidden-1');
    const unreadRow = paneBody(page, 'primary').getByRole('button', { exact: true, name: 'all' });
    await expect(unreadRow).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(unreadRow).toBeVisible();

    // Showing the chat's tab brings back its draft and marks it read.
    await tabs.nth(0).getByRole('button', { name: 'all', exact: true }).click();
    await expect(composer).toHaveText('Keep this draft');
    await tabs.nth(1).getByRole('button', { name: 'Inbox', exact: true }).click();
    await expect(page.getByText('All caught up.')).toBeVisible();
});

function tabRow(page: Page, name: string) {
    return page.getByRole('navigation', { exact: true, name });
}

function paneBody(page: Page, pane: 'primary' | 'secondary') {
    return page.locator(`.desktop-tab-frame[data-frame-pane="${pane}"]:visible`);
}

/** Stubbed bridge events: Go menu Back (⌘[) and File > Close (⌘W). */
async function desktopEvent(page: Page, name: 'test:desktop-close' | 'test:desktop-history') {
    await page.evaluate((event) => window.dispatchEvent(new Event(event)), name);
}

async function dragTab(page: Page, source: Locator, target: Locator) {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    await dragTabTo(page, source, {
        x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
        y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
    });
}

/** A pointer drag past dnd-kit's activation distance, in steps so collisions update. */
async function dragTabTo(page: Page, source: Locator, to: { x: number; y: number }) {
    // Tabs slide into place after a drop; press only once none is mid-transition.
    await page.waitForFunction(() =>
        [...document.querySelectorAll('.workspace-tab')].every(
            (tab) => tab.getAnimations().length === 0
        )
    );
    const box = await source.boundingBox();
    expect(box).not.toBeNull();
    const from = { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + 8 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 12, from.y, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 20 });
    await page.mouse.up();
}
