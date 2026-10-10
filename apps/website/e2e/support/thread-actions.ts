import type { Locator } from '@playwright/test';

export async function openMessageThread(message: Locator) {
    const messageRow = message.locator('xpath=ancestor::*[@data-slot="chat-message-assistant"][1]');
    await messageRow.hover();
    await messageRow.locator('button[aria-label="Reply in thread"]').click();
}
