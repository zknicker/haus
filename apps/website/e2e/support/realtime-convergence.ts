import type { Page, Route } from '@playwright/test';
import type { RealtimeProxy } from './realtime-proxy.ts';
import { type createRealtimeScene, showTab, tabs, visibleSurface } from './realtime-scene.ts';
import { expect } from './test.ts';

type Scene = Awaited<ReturnType<typeof createRealtimeScene>>;

/**
 * C. Stale HTTP ordering: an older `chat.message` read for M is held while a
 * newer reaction invalidates M and a newer read completes; releasing the old
 * response must not overwrite the Server's final reactions.
 */
export async function expectStaleEntityReadLoses(page: Page, scene: Scene) {
    const messageId = scene.anchorId;
    let held: Route | null = null;
    await page.route('**/trpc/**', async (route) => {
        const procedures = new URL(route.request().url()).pathname
            .slice('/trpc/'.length)
            .split(',');
        const readsAnchor =
            procedures.includes('chat.message') &&
            (route.request().postData() ?? '').includes(messageId);
        if (readsAnchor && held === null) {
            held = route;
            return;
        }
        await route.continue();
    });
    await showTab(page, 'product');
    const react = (emoji: string, remove = false) =>
        scene.client.chat.react.mutate({ emoji, messageId, remove, serverId: scene.server.id });

    await react('👍');
    await expect.poll(() => held !== null, { timeout: 15_000 }).toBe(true);
    await react('🎉');
    const row = visibleSurface(page).locator(`[data-message-id="${messageId}"]`);
    await expect(row).toContainText('🎉', { timeout: 15_000 });
    await (held as Route | null)?.continue().catch(() => undefined);
    await page.waitForTimeout(500);
    await expect(row).toContainText('👍');
    await expect(row).toContainText('🎉');
    await page.unroute('**/trpc/**');
}

/**
 * Event convergence, not HTTP ordering: a replayed `chat.onMessageCreated`
 * frame ends with one copy, and two reaction frames delivered in reverse
 * order converge on the Server's state.
 */
export async function expectEventsConverge(page: Page, scene: Scene, proxy: RealtimeProxy) {
    await showTab(page, 'all');
    proxy.duplicateNext('chat.onMessageCreated');
    await scene.changes.allReply('A reply exactly once', 'converge-duplicate');
    await expect(visibleSurface(page).getByText('A reply exactly once')).toHaveCount(1, {
        timeout: 15_000,
    });
    await page.waitForTimeout(500);
    await expect(visibleSurface(page).getByText('A reply exactly once')).toHaveCount(1);

    await showTab(page, 'product');
    proxy.reverseNextPair('chat.onMessageReactionUpdated');
    const react = (emoji: string, remove = false) =>
        scene.client.chat.react.mutate({
            emoji,
            messageId: scene.anchorId,
            remove,
            serverId: scene.server.id,
        });
    await react('❤️');
    await react('👍', true);
    const row = visibleSurface(page).locator(`[data-message-id="${scene.anchorId}"]`);
    await expect(row).toContainText('❤️', { timeout: 15_000 });
    await expect(row).not.toContainText('👍');
    await expect(row).toContainText('🎉');
}

/**
 * D. Chat deletion: deleting a Chat held in a kept, hidden tab purges it. Its
 * sidebar row goes, and no retained view keeps rendering its transcript.
 */
export async function expectDeletedChatPurged(page: Page, scene: Scene) {
    await showTab(page, 'all');
    await scene.client.chat.deleteChannel.mutate({
        chatId: scene.work.chatId,
        confirmation: 'product',
        serverId: scene.server.id,
    });
    await expect(page.getByRole('row', { exact: true, name: 'product' })).toHaveCount(0, {
        timeout: 15_000,
    });
    // Revealing the deleted Chat's tab never renders it from cache.
    await tabs(page).nth(0).getByRole('button').first().click();
    await expect(
        page.locator('[data-slot="chat-surface"]').getByText('Product anchor for the Thread')
    ).toHaveCount(0, { timeout: 15_000 });
}
