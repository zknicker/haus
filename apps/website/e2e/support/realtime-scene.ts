import type { Page } from '@playwright/test';
import { cloudAgentObservationFrame, seedCloudAgentWork } from './agent-cloud-agent.ts';
import { createChannelAgent } from './channel-agent.ts';
import { sendBootstrap, socketMessage, socketOpen } from './computer-socket.ts';
import { installDesktopBrowserStub, openDesktopWindow } from './desktop-browser-stub.ts';
import { createClient, createTestServer, openChannel } from './server.ts';
import { expect } from './test.ts';

/**
 * The incident detector's scene (specs/realtime-events.md, "App e2e"): a
 * desktop window whose shown tab A is `#all` and whose kept, hidden tab B is
 * `#product`, which holds a Thread anchor and a Cloud Agent work Message. Two
 * Agents with no model write through the Agent API, and a Computer reports
 * the work's progress over its attachment.
 */
export async function createRealtimeScene(page: Page, slug: string) {
    await installDesktopBrowserStub(page);
    const { client, server, session } = await createTestServer(page, {
        displayName: `Realtime ${slug}`,
        slug,
    });
    const computerCredential = `computer-${slug}-credential-0001`;
    const orbit = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug,
        token: session.accessToken,
    });
    await client.chat.createChannel.mutate({
        agentIds: [orbit.agentId],
        name: 'product',
        serverId: server.id,
    });
    const work = await seedCloudAgentWork({
        agentHandle: 'scout',
        channelName: 'product',
        computerCredential,
        content: 'Delegating the index rebuild to a Cloud Agent.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug,
        title: 'Rebuild the search index',
        token: session.accessToken,
    });
    const anchor = await client.chat.send.mutate({
        chatId: work.chatId,
        content: 'Product anchor for the Thread',
        nonce: `${slug}-anchor`,
        serverId: server.id,
    });
    await client.chat.send.mutate({
        chatId: work.chatId,
        content: 'First human reply in the Thread',
        nonce: `${slug}-anchor-reply`,
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });

    await openDesktopWindow(page, `/s/${slug}`);
    await openChannel(page, 'product');
    await expect(composer(page, 'product')).toBeVisible();
    await expect(threadSummary(page, 1)).toBeVisible();
    await page.getByRole('row', { exact: true, name: 'all' }).click({ modifiers: ['Meta'] });
    await expect(tabs(page)).toHaveCount(2);
    await showTab(page, 'all');

    // Changes 1 and 2 come from the human's other device; `agentReply` is a
    // real Agent send. An Agent send also announces a `sending` lifecycle, which
    // owns activity only: nothing but the message stream's own start recovers
    // a missed message, whoever wrote it.
    const device = createClient(session.accessToken);
    const changes = {
        /** An Agent reply in `#product` (the kept tab) through the Agent API. */
        agentReply: (content: string, nonce: string) => orbit.send(content, nonce, '#product'),
        /** Change 1: a reply in `#all`. */
        allReply: (content: string, nonce: string) =>
            device.chat.send.mutate({ chatId: orbit.chatId, content, nonce, serverId: server.id }),
        /** Change 2: a reply in `#product`'s Thread; no new parent-Chat message. */
        threadReply: (content: string, nonce: string) =>
            device.chat.send.mutate({
                chatId: work.chatId,
                content,
                nonce,
                serverId: server.id,
                thread: { anchorMessageId: anchor.message.id },
            }),
        /** Change 3: the Computer reports the Cloud Agent work's progress. */
        workUpdate: async (activity: string) => {
            const computer = new WebSocket(
                `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
            );
            await socketOpen(computer);
            const accepted = socketMessage(computer);
            sendBootstrap(computer, computerCredential, 'complete');
            expect(await accepted).toMatchObject({ mode: 'ordinary' });
            computer.send(
                cloudAgentObservationFrame({
                    activity,
                    observedAt: new Date().toISOString(),
                    runId: work.runId,
                    status: 'running',
                    workId: work.workId,
                })
            );
            return computer;
        },
    };

    return { anchorId: anchor.message.id, changes, client, server, session, work };
}

export function composer(page: Page, channel: string) {
    return page.getByRole('textbox', { name: `Message ${channel}` });
}

export function tabs(page: Page) {
    return page.getByRole('navigation', { exact: true, name: 'Tabs' }).locator('.workspace-tab');
}

export async function showTab(page: Page, channel: string) {
    await tabs(page).getByRole('button', { exact: true, name: channel }).click();
    await expect(composer(page, channel)).toBeVisible();
}

export function visibleSurface(page: Page) {
    return page.locator('[data-slot="chat-surface"]').filter({ visible: true });
}

export function threadSummary(page: Page, replies: number) {
    return visibleSurface(page).getByRole('button', {
        name: new RegExp(`^Open thread, ${replies} repl(y|ies)`, 'u'),
    });
}

/**
 * The convergence assertions: tab A shows the `#all` reply with no reload;
 * revealing tab B shows the Thread summary and the updated Cloud Agent row;
 * opening the Thread shows the Agent's reply.
 */
export async function expectConverged(
    page: Page,
    scene: Awaited<ReturnType<typeof createRealtimeScene>>,
    expected: { activity: string; allReply: string; threadReply: string }
) {
    await expect(visibleSurface(page).getByText(expected.allReply)).toBeVisible({
        timeout: 15_000,
    });
    await showTab(page, 'product');
    await expect(threadSummary(page, 2)).toBeVisible({ timeout: 15_000 });
    await expect(
        visibleSurface(page)
            .locator(`[data-message-id="${scene.work.messageId}"]`)
            .getByTestId('cloud-agent-work-status-line')
    ).toContainText(expected.activity, { timeout: 15_000 });
    await threadSummary(page, 2).click();
    await expect(
        page
            .getByRole('region', { exact: true, name: 'Thread' })
            .getByText(expected.threadReply, { exact: true })
    ).toBeVisible();
    // The Thread opened in a right pane; closing its tab returns to one pane.
    await page
        .getByRole('button', { exact: true, name: 'Close Product anchor for the Thread' })
        .click();
    await expect(tabs(page)).toHaveCount(2);
}
