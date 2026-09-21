import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { createAgentThreadSender } from './agent-thread.ts';
import { clerkSessionFile, signInAsClerkHuman } from './clerk-session.ts';
import { openChannel } from './server.ts';
import { expect } from './test.ts';

export async function verifyAgentThreadRecovery(page: Page) {
    let dropMessageCreated = false;
    let droppedMessages = 0;
    await page.routeWebSocket(/\/trpc/u, (socket) => {
        const server = socket.connectToServer();
        server.onMessage((message) => {
            if (dropMessageCreated && message.toString().includes('"message.created"')) {
                droppedMessages += 1;
                return;
            }
            socket.send(message);
        });
    });
    await signInAsClerkHuman(page);
    await page.goto('/s/hosted-messages');
    await openChannel(page, 'all');

    const anchorText = 'Agent delivery anchor';
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill(anchorText);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(anchorText, { exact: true })).toBeVisible();

    // The human only OPENS the Thread; the Agent authors every reply through the
    // Server -> Computer path exactly as task clarifications and reminder
    // follow-ups arrive.
    const anchorArticle = page
        .getByText(anchorText, { exact: true })
        .locator('xpath=ancestor::div[@data-message-id][1]');
    const anchorRow = anchorArticle.locator(
        'xpath=ancestor::*[@data-slot="chat-message-assistant"][1]'
    );
    await anchorRow.hover();
    await anchorRow.locator('button[aria-label="Reply in thread"]').click();
    const panel = page.getByRole('complementary', { name: 'Thread' });
    await expect(panel).toBeVisible();

    const { databaseUrl, token } = JSON.parse(readFileSync(clerkSessionFile(), 'utf8')) as {
        databaseUrl: string;
        token: string;
    };
    const agent = await createAgentThreadSender({ anchorText, databaseUrl, token });

    // The confirmed-send lifecycle must recover the durable row even when its
    // ordinary message notification is lost. A transient preview cannot pass.
    dropMessageCreated = true;
    await agent.send('Agent thread clarification', 'e2e-agent-thread-live');
    const clarification = panel
        .getByText('Agent thread clarification', { exact: true })
        .locator('xpath=ancestor::div[@data-message-id][1]');
    await expect(clarification).toHaveCount(1);
    await expect(clarification).toBeVisible();
    expect(droppedMessages).toBeGreaterThan(0);
    dropMessageCreated = false;

    // A reply that lands while the Thread is closed must appear on reopen.
    await panel.getByRole('button', { name: 'Close thread' }).click();
    await agent.send('Agent reply while the thread was closed', 'e2e-agent-thread-closed');
    await expect(page.getByRole('button', { name: /2 replies/u })).toBeVisible();
    await page.getByRole('button', { name: /2 replies/u }).click();
    await expect(
        panel.getByText('Agent reply while the thread was closed', { exact: true })
    ).toBeVisible();

    // A reply authored while the App is offline is recovered on reconnect.
    await page.context().setOffline(true);
    await agent.send('Agent reply sent while the App was offline', 'e2e-agent-thread-offline');
    await page.context().setOffline(false);
    await expect(
        panel.getByText('Agent reply sent while the App was offline', { exact: true })
    ).toBeVisible();
}
