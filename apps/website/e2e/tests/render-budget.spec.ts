import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { installRenderBudget } from '../support/render-budget.ts';
import { createClient, createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// Component renders per interaction with kept chat views, against the
// ratchet in e2e/render-budgets.json. One message anywhere used to re-render
// every row of every kept transcript; these budgets keep that from creeping
// back. Counts come from the dev bundle (React dev, StrictMode effects off the
// render path), so they are larger than the prod render audit's
// (scripts/perf/render-audit.mjs) and only comparable with themselves.

test('web: idle, realtime messages, a warm switch, and a profile stay within budget', async ({
    page,
}, testInfo) => {
    test.setTimeout(180_000);
    const budget = await installRenderBudget(page, testInfo, 'web');
    const app = await openKeptChannels(page, 'render-budget-web');

    // Shown: #design. Kept: #all and #ops.
    await budget.measure('idle-30s', async () => {
        await page.clock.fastForward(30_000);
    });
    await budget.measure('message-in-kept-chat', async () => {
        await app.agent.send('An Agent note in a kept channel', 'render-budget-kept');
        await realtimeDelivery(page);
    });
    await budget.measure('message-in-open-chat', async () => {
        await app.sendAsPeerDevice('design', 'A note in the open channel');
        await expect(visibleSurface(page).getByText('A note in the open channel')).toBeVisible();
    });
    await budget.measure('warm-channel-switch', async () => {
        await openChannel(page, 'ops');
        await expect(composer(page, 'ops')).toBeVisible();
    });
    await budget.measure('open-agent-profile', async () => {
        await sidebarRow(page, 'Orbit').click({ button: 'right' });
        await page.getByRole('menuitem', { exact: true, name: 'View agent profile' }).click();
        await expect(page.getByRole('heading', { exact: true, name: 'Orbit' })).toBeVisible();
    });
});

test('desktop: a warm tab switch stays within budget', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const budget = await installRenderBudget(page, testInfo, 'desktop');
    await installDesktopBrowserStub(page);
    const app = await openKeptChannels(page, 'render-budget-desktop', { desktop: true });
    const tabs = page
        .getByRole('navigation', { exact: true, name: 'Tabs' })
        .locator('.workspace-tab');
    // Command-click opens #all in a background tab beside #design's.
    await sidebarRow(page, 'all').click({ modifiers: ['Meta'] });
    await expect(tabs).toHaveCount(2);
    // Reveal each tab once so both switches below are warm.
    await tabs.nth(1).getByRole('button', { exact: true, name: 'all' }).click();
    await expect(composer(page, 'all')).toBeVisible();
    await tabs.nth(0).getByRole('button', { exact: true, name: 'design' }).click();
    await expect(composer(page, 'design')).toBeVisible();

    await budget.measure('warm-tab-switch', async () => {
        await tabs.nth(1).getByRole('button', { exact: true, name: 'all' }).click();
        await expect(composer(page, 'all')).toBeVisible();
    });
    await budget.measure('message-in-background-tab', async () => {
        await app.sendAsPeerDevice('design', 'A note for the background tab');
        await realtimeDelivery(page);
    });
});

/**
 * A Server with an Agent and three channels holding history, visited in turn
 * so #all and #ops are kept views behind the shown #design.
 */
async function openKeptChannels(page: Page, slug: string, options: { desktop?: boolean } = {}) {
    await page.clock.install();
    const { client, server, session } = await createTestServer(page, { displayName: slug, slug });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug,
        token: session.token,
    });
    const channelIds: Record<string, string> = { all: agent.chatId };
    for (const name of ['design', 'ops']) {
        const created = await client.chat.createChannel.mutate({
            agentIds: [agent.agentId],
            name,
            serverId: server.id,
        });
        channelIds[name] = created.id;
    }
    // The human's other device: same identity, a different client.
    const device = createClient(session.token);
    const sendAsPeerDevice = (channel: string, content: string) =>
        device.chat.send.mutate({
            chatId: channelIds[channel] as string,
            content,
            nonce: `render-budget-${channel}-${content.length}-${Date.now()}`,
            serverId: server.id,
        });
    for (const [channel, chatId] of Object.entries(channelIds)) {
        for (let index = 0; index < 12; index += 1) {
            const content = `History ${index} in ${channel}: a line long enough to wrap once on a laptop.`;
            // The Agent writes #all's history, so it has read everything there and may post.
            if (channel === 'all') {
                await agent.send(content, `render-budget-history-all-${index}`);
                continue;
            }
            await device.chat.send.mutate({
                chatId,
                content,
                nonce: `render-budget-history-${channel}-${index}`,
                serverId: server.id,
            });
        }
    }
    if (options.desktop) {
        await openDesktopWindow(page, `/s/${slug}`);
    } else {
        await page.reload();
    }
    for (const channel of ['all', 'ops', 'design']) {
        await openChannel(page, channel);
        await expect(composer(page, channel)).toBeVisible();
        await expect(visibleSurface(page).getByText(`History 11 in ${channel}`)).toBeVisible();
    }
    return { agent, sendAsPeerDevice };
}

/** A Server write has reached the App over the socket and its renders have started. */
function realtimeDelivery(page: Page) {
    return page.waitForTimeout(1000);
}

function sidebarRow(page: Page, name: string) {
    return page.getByRole('row', { exact: true, name });
}

function composer(page: Page, channel: string) {
    return page.getByRole('textbox', { name: `Message ${channel}` });
}

function visibleSurface(page: Page) {
    return page.locator('[data-slot="chat-surface"]').filter({ visible: true });
}
