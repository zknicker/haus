import { readFileSync } from 'node:fs';
import type { Locator } from '@playwright/test';
import { clerkSessionFile, signInAsClerkHuman } from '../support/clerk-session.ts';
import {
    assertOpaqueId,
    completeOnboarding,
    createClient,
    openChannel,
} from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const anchorText = 'Drop target anchor message';

test.beforeAll(async () => {
    const { databaseUrl, token } = JSON.parse(readFileSync(clerkSessionFile(), 'utf8')) as {
        databaseUrl: string;
        token: string;
    };
    const owner = createClient(token);
    await owner.server.create.mutate({ displayName: 'Composer Drops', slug: 'composer-drops' });
    const server = await owner.server.bySlug.query({ slug: 'composer-drops' });
    const allChatId = server.channels.find((channel) => channel.name === 'all')?.id;
    assertOpaqueId(server.id);
    assertOpaqueId(allChatId);
    completeOnboarding(databaseUrl, server.id);
    await owner.chat.send.mutate({
        chatId: allChatId,
        content: anchorText,
        nonce: 'e2e-composer-drop-anchor',
        serverId: server.id,
    });
});

test('files dropped on a chat or its Thread attach to that composer only', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto('/s/composer-drops');
    await openChannel(page, 'all');

    const anchor = page.getByText(anchorText, { exact: true });
    const overlay = page.getByTestId('composer-file-drop-overlay');
    await dragFile(anchor, 'dragover', 'screenshot.png');
    await expect(overlay).toBeVisible();
    await dragFile(anchor, 'drop', 'screenshot.png');
    await expect(overlay).toHaveCount(0);
    const chatAttachment = page.getByRole('button', { name: 'Remove screenshot.png' });
    await expect(chatAttachment).toBeVisible();

    const messageRow = anchor.locator('xpath=ancestor::*[@data-slot="chat-message-assistant"][1]');
    await messageRow.hover();
    await messageRow.locator('button[aria-label="Reply in thread"]').click();
    const thread = page.getByRole('complementary', { name: 'Thread' });
    await expect(thread).toBeVisible();

    // The Thread pane is its own drop surface, so the chat composer keeps
    // its single attachment.
    await dragFile(thread.getByText(anchorText, { exact: true }), 'drop', 'thread-shot.png');
    await expect(thread.getByRole('button', { name: 'Remove thread-shot.png' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove thread-shot.png' })).toHaveCount(1);
    await expect(chatAttachment).toHaveCount(1);
});

test('the drop overlay tracks a file drag across children and only for files', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto('/s/composer-drops');
    await openChannel(page, 'all');
    const overlay = page.getByTestId('composer-file-drop-overlay');
    const drag = (steps: DragStep[]) =>
        page.evaluate((sequence) => {
            // Recently opened Chats stay mounted hidden; target the one on screen.
            const find = (selector: string | null) =>
                selector
                    ? ([...document.querySelectorAll(selector)].find((node) =>
                          node.checkVisibility()
                      ) ?? null)
                    : null;
            for (const step of sequence) {
                const transfer = new DataTransfer();
                if (step.files) {
                    transfer.items.add(new File(['png'], 'shot.png', { type: 'image/png' }));
                } else {
                    transfer.setData('text/plain', 'dragged text');
                }
                find(step.on)?.dispatchEvent(
                    new DragEvent(step.type, {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: transfer,
                        relatedTarget: find(step.related),
                    })
                );
            }
        }, steps);
    const message = '[data-slot="chat-message-assistant"]';
    const composer = '[data-slot="chat-surface"] .prompt-input';
    await expect(page.getByText(anchorText, { exact: true })).toBeVisible();

    // Text and links are not attachments.
    await drag([{ files: false, on: message, related: null, type: 'dragenter' }]);
    await expect(overlay).toHaveCount(0);

    // Crossing from a message into the composer keeps it up: the next enter
    // lands before the previous leave.
    await drag([
        { files: true, on: message, related: null, type: 'dragenter' },
        { files: true, on: composer, related: message, type: 'dragenter' },
        { files: true, on: message, related: composer, type: 'dragleave' },
    ]);
    await expect(overlay).toBeVisible();

    // Leaving the window (no related target) clears it.
    await drag([{ files: true, on: composer, related: null, type: 'dragleave' }]);
    await expect(overlay).toHaveCount(0);

    // A cancelled drag (Escape) ends with dragend.
    await drag([{ files: true, on: message, related: null, type: 'dragenter' }]);
    await expect(overlay).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('dragend')));
    await expect(overlay).toHaveCount(0);
});

interface DragStep {
    files: boolean;
    on: string;
    related: string | null;
    type: 'dragenter' | 'dragleave';
}

async function dragFile(target: Locator, type: 'dragover' | 'drop', name: string) {
    const dataTransfer = await target.page().evaluateHandle((fileName) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['png bytes'], fileName, { type: 'image/png' }));
        return transfer;
    }, name);
    await target.dispatchEvent(type, { dataTransfer });
}
