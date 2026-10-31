import { mkdirSync } from 'node:fs';
import { cloudAgentObservationFrame, seedCloudAgentWork } from '../support/agent-cloud-agent.ts';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const screenshots = '/tmp/haus-cloud-automations';

test('Automations exposes automatic cloud handoffs and keeps delivered work in history', async ({
    page,
}) => {
    test.setTimeout(90_000);
    await page.emulateMedia({ colorScheme: 'dark' });
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Haus',
        slug: 'cloud-automations',
    });
    const credential = 'cloud-automations-computer-credential-12';
    const seeded = await seedCloudAgentWork({
        agentHandle: 'forge',
        channelName: 'all',
        computerCredential: credential,
        content: 'I’m adding cloud-agent wake visibility to Automations.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug: server.slug,
        title: 'Show cloud-agent handoffs in Automations',
        token: session.accessToken,
    });
    await client.agent.updateProfile.mutate({
        agentId: seeded.agentId,
        displayName: 'Forge',
        description: null,
        serverId: server.id,
    });
    const socket = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(socket);
    const accepted = socketMessage(socket);
    sendBootstrap(socket, credential, 'complete');
    expect(await accepted).toMatchObject({ mode: 'ordinary' });
    socket.send(
        cloudAgentObservationFrame({
            observedAt: new Date().toISOString(),
            runId: seeded.runId,
            status: 'running',
            workId: seeded.workId,
        })
    );
    const route = `/s/${server.slug}/agents/${seeded.agentId}/automations`;
    await page.goto(route);
    const row = page.getByRole('button', { name: /Show cloud-agent handoffs/u });
    await expect(row).toContainText('Working');
    await expect(page.getByText(/Managed by Haus/u)).toBeVisible();
    await expect
        .poll(() =>
            row
                .locator('img')
                .first()
                .evaluate(
                    (image) =>
                        image instanceof HTMLImageElement &&
                        image.complete &&
                        image.naturalWidth > 0
                )
        )
        .toBe(true);
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({ path: `${screenshots}/running.png` });
    await row.click();
    await expect(page).toHaveURL(new RegExp(`thread=${seeded.messageId}`, 'u'));
    await page.goto(route);
    socket.send(
        cloudAgentObservationFrame({
            observedAt: new Date().toISOString(),
            runId: seeded.runId,
            status: 'completed',
            summary: 'The change is ready for review.',
            workId: seeded.workId,
        })
    );
    await expect(row).toContainText('Result queued');
    await page.mouse.move(5, 5);
    await page.screenshot({ path: `${screenshots}/result-queued.png` });
    await page.setViewportSize({ width: 760, height: 900 });
    await expect(row).toBeVisible();
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.screenshot({ path: `${screenshots}/narrow.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
    // The fixture has no executing model. Mark its durable inbox identity seen to
    // exercise the same list membership a successfully settled Agent turn produces.
    runPsql(
        session.databaseUrl,
        `update agent_inbox set state = 'seen', seen_at = now()
        where server_id = '${server.id}' and dedupe_key = '${seeded.runId}'`
    );
    await page.reload();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'View cloud agent history' }).click();
    await expect(row).toContainText('Result delivered to the agent');
    await expect(row).toContainText('Done');
    await page.mouse.move(5, 5);
    await page.screenshot({ path: `${screenshots}/history.png` });
    await row.click();
    await expect(page).toHaveURL(new RegExp(`thread=${seeded.messageId}`, 'u'));
    socket.close();
});
