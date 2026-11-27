import type { Page } from '@playwright/test';
import { createChannelAgent } from './channel-agent.ts';
import { installDesktopBrowserStub, openDesktopWindow } from './desktop-browser-stub.ts';
import { createProjectWithAgents } from './project.ts';
import { createClient, createTestServer, openChannel } from './server.ts';
import { expect } from './test.ts';

/**
 * The incident detector's scene (specs/realtime-events.md, "App e2e"): a
 * desktop window whose shown tab A is `#all` and whose kept, hidden tab B is
 * `#product`, which holds an inline reply anchor that also started a crew
 * Task, whose page is a third kept tab. An Agent with no model writes through
 * the Agent API, and the human's other device renames the Task.
 */
export async function createRealtimeScene(page: Page, slug: string) {
    await installDesktopBrowserStub(page);
    const { client, server, session } = await createTestServer(page, {
        displayName: `Realtime ${slug}`,
        slug,
    });
    const orbit = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug,
        token: session.accessToken,
    });
    const product = await createProjectWithAgents(client, {
        agentIds: [orbit.agentId],
        name: 'product',
        serverId: server.id,
    });
    const anchor = await client.chat.send.mutate({
        chatId: product.id,
        content: 'Product anchor for inline replies',
        nonce: `${slug}-anchor`,
        serverId: server.id,
    });
    const started = await orbit.startTask({
        from: anchor.message.id,
        target: '#product',
        title: 'Rebuild the search index',
    });
    const task = await client.task.get.query({ serverId: server.id, shortId: started.shortId });
    const work = { chatId: product.id, taskId: task.id, taskShortId: started.shortId };

    await openDesktopWindow(page, `/s/${slug}`);
    await openChannel(page, 'product');
    await expect(composer(page, 'product')).toBeVisible();
    await expect(visibleSurface(page).getByText('Product anchor for inline replies')).toBeVisible();
    await page.getByRole('row', { exact: true, name: 'all' }).click({ modifiers: ['Meta'] });
    await expect(tabs(page)).toHaveCount(2);
    await showTab(page, 'product');
    await visibleSurface(page)
        .getByRole('button', { name: /^Open task Rebuild the search index,/u })
        .click({ modifiers: ['Meta'] });
    await expect(tabs(page)).toHaveCount(3);
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
        /** Change 3: a rename of the Task, which its own stream carries. */
        taskRename: async (title: string) => {
            const current = await device.task.get.query({
                serverId: server.id,
                taskId: work.taskId,
            });
            await device.task.update.mutate({
                expectedVersion: current.version,
                patch: { title },
                serverId: server.id,
                taskId: work.taskId,
            });
        },
    };

    return {
        anchorId: anchor.message.id,
        changes,
        client,
        homedAgentIds: [orbit.agentId],
        server,
        session,
        work,
    };
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
 * revealing tab B shows the inline reply, and the Task tab shows its new title.
 */
export async function expectConverged(
    page: Page,
    scene: Awaited<ReturnType<typeof createRealtimeScene>>,
    expected: { allReply: string; inlineReply: string; taskTitle: string }
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
    await tabs(page)
        .getByRole('button', { name: new RegExp(scene.work.taskShortId, 'u') })
        .click();
    await expect(
        page.getByText(expected.taskTitle, { exact: true }).filter({ visible: true }).first()
    ).toBeVisible({ timeout: 15_000 });
}
