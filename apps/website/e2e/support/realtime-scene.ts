import type { Page } from '@playwright/test';
import { workerObservationFrame, seedWorker } from './agent-worker.ts';
import { createChannelAgent } from './channel-agent.ts';
import { sendBootstrap, socketMessage, socketOpen } from './computer-socket.ts';
import { installDesktopBrowserStub, openDesktopWindow } from './desktop-browser-stub.ts';
import { createProjectWithAgents } from './project.ts';
import { createClient, createTestServer, openChannel } from './server.ts';
import { expect } from './test.ts';

/**
 * The incident detector's scene (specs/realtime-events.md, "App e2e"): a
 * desktop window whose shown tab A is `#all` and whose kept, hidden tab B is
 * `#product`, which holds an inline reply anchor and a Worker Message. Two
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
    await createProjectWithAgents(client, {
        agentIds: [orbit.agentId],
        name: 'product',
        serverId: server.id,
    });
    const work = await seedWorker({
        agentHandle: 'scout',
        channelName: 'product',
        computerCredential,
        content: 'Delegating the index rebuild to a Worker.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug,
        title: 'Rebuild the search index',
        token: session.accessToken,
    });
    const anchor = await client.chat.send.mutate({
        chatId: work.chatId,
        content: 'Product anchor for inline replies',
        nonce: `${slug}-anchor`,
        serverId: server.id,
    });

    await openDesktopWindow(page, `/s/${slug}`);
    await openChannel(page, 'product');
    await expect(composer(page, 'product')).toBeVisible();
    await expect(visibleSurface(page).getByText('Product anchor for inline replies')).toBeVisible();
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
        inlineReply: (content: string, nonce: string) =>
            device.chat.send.mutate({
                chatId: work.chatId,
                content,
                nonce,
                replyToMessageId: anchor.message.id,
                serverId: server.id,
            }),
        /** Change 3: the Computer reports the Worker's progress. */
        workUpdate: async (activity: string) => {
            const computer = new WebSocket(
                `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
            );
            await socketOpen(computer);
            const accepted = socketMessage(computer);
            sendBootstrap(computer, computerCredential, 'complete');
            expect(await accepted).toMatchObject({ mode: 'ordinary' });
            computer.send(
                workerObservationFrame({
                    activity,
                    observedAt: new Date().toISOString(),
                    turnId: work.turnId,
                    status: 'running',
                    workerId: work.workerId,
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

/**
 * The convergence assertions: tab A shows the `#all` reply with no reload;
 * revealing tab B shows the inline reply and the updated Worker row.
 */
export async function expectConverged(
    page: Page,
    scene: Awaited<ReturnType<typeof createRealtimeScene>>,
    expected: { activity: string; allReply: string; inlineReply: string }
) {
    await expect(visibleSurface(page).getByText(expected.allReply)).toBeVisible({
        timeout: 15_000,
    });
    await showTab(page, 'product');
    await expect(visibleSurface(page).getByText(expected.inlineReply, { exact: true })).toBeVisible(
        {
            timeout: 15_000,
        }
    );
    await expect(
        visibleSurface(page)
            .locator(`[data-message-id="${scene.work.messageId}"]`)
            .getByTestId('worker-status-line')
    ).toContainText(expected.activity, { timeout: 15_000 });
}
