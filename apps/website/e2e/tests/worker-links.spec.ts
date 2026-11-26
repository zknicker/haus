import { formatWorkerLink } from '@haus/api';
import { seedWorker } from '../support/agent-worker.ts';
import { createProjectWithAgents } from '../support/project.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const credential = 'computer-worker-links-credential-12345';
const slug = 'worker-links';
const title = 'Move the export worker';
const brief = 'Move the export worker onto the new queue.';

test('a Worker opens from its Task, and a chat link to it reads as its title', async ({ page }) => {
    test.setTimeout(90_000);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Worker Links',
        slug,
    });
    await createProjectWithAgents(client, { agentIds: [], name: 'launch', serverId: server.id });
    const techOps = await createProjectWithAgents(client, {
        agentIds: [],
        name: 'tech-ops',
        serverId: server.id,
    });
    const seeded = await seedWorker({
        agentHandle: 'orbit',
        brief,
        channelName: 'launch',
        computerCredential: credential,
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug,
        title,
        token: session.accessToken,
    });

    const moved = await client.chat.send.mutate({
        chatId: techOps.id,
        content: `Tracking the move here: ${formatWorkerLink(title, seeded.workerId)}`,
        nonce: 'link-move',
        serverId: server.id,
    });
    const forged = await client.chat.send.mutate({
        chatId: techOps.id,
        content: `Not real: ${formatWorkerLink('Forged job', 'wkr_forged')}`,
        nonce: 'link-forged',
        serverId: server.id,
    });

    await page.goto(`/s/${slug}`);
    await openChannel(page, 'tech-ops');
    const linking = page.locator(`[data-message-id="${moved.message.id}"]`);
    await expect(linking).toContainText(`Tracking the move here: ${title}`);
    await expect(linking.getByTestId('worker-row')).toHaveCount(0);
    await expect(linking.getByRole('link', { name: title })).toHaveCount(0);
    const forgedRow = page.locator(`[data-message-id="${forged.message.id}"]`);
    await expect(forgedRow).toContainText('Forged job');
    await expect(forgedRow.getByTestId('worker-row')).toHaveCount(0);

    await page.goto(`/s/${slug}/tasks/${seeded.taskShortId}`);
    await page.getByRole('grid', { name: 'Workers' }).getByTestId('worker-row').click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/workers/${seeded.workerId}$`, 'u'));
    await expect(page.getByText(brief)).toBeVisible();
});
