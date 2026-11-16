import type { Locator, Page } from '@playwright/test';
import { expect } from './test.ts';

export async function openMessageThread(message: Locator) {
    const messageRow = message.locator('xpath=ancestor::*[@data-slot="chat-message-assistant"][1]');
    await messageRow.hover();
    await messageRow.locator('button[aria-label="Reply in thread"]').click();
}

/**
 * Unfollows from the Thread's name menu, then reads the menu's way back and leaves
 * it closed. A menu leaving restores focus to its trigger as it unmounts, which
 * would take focus from one reopened during that exit and leave Escape nothing to
 * close, so each step waits for the one before it.
 */
export async function unfollowFromThreadMenu(page: Page, panel: Locator) {
    const threadMenu = panel.getByRole('button', { name: /thread actions$/u });
    await threadMenu.click();
    await page.getByRole('menuitem', { name: 'Stop following thread' }).click();
    await expect(page.getByRole('menu', { includeHidden: true })).toHaveCount(0);
    await threadMenu.click();
    await expect(page.getByRole('menuitem', { name: 'Follow thread' })).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => document.activeElement?.closest('[role="menu"]') !== null))
        .toBe(true);
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('menuitem', { includeHidden: true, name: 'Follow thread' })
    ).toHaveCount(0);
}
