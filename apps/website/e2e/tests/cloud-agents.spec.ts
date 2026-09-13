import {
    cloudAgentObservationFrame,
    seedCloudAgentWork,
    startCloudAgentWork,
} from '../support/agent-cloud-agent.ts';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const workTitle = 'Fix the failing migration';
const credential = 'computer-cloud-agent-work-credential-12';

test('Cloud Agent work reads as a Chat surface header and an in-Thread card', async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    const { server, session } = await createTestServer(page, {
        displayName: 'Cloud Agent Work',
        slug: 'cloud-agent-work',
    });
    const seeded = await seedCloudAgentWork({
        agentHandle: 'orbit',
        channelName: 'all',
        computerCredential: credential,
        content: 'Delegating the migration fix to a Cloud Agent.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug: 'cloud-agent-work',
        startingRef: 'main',
        title: workTitle,
        token: session.token,
    });

    // The Inbox is where background work that outlives a turn stays visible.
    await page.goto('/s/cloud-agent-work/inbox');
    // Inbox rows are pressable cards named by their title, not grid rows.
    const inboxRow = page.getByRole('button', { name: new RegExp(workTitle, 'u') });
    await expect(inboxRow).toBeVisible();
    await expect(inboxRow).toContainText('Queued');
    await expect(inboxRow).toContainText('#all');
    await expect(inboxRow).toContainText('Orbit');

    // The Chat carries the same work as the header of its Thread surface.
    await page.goto('/s/cloud-agent-work');
    await openChannel(page, 'all');
    const header = page.getByTestId('cloud-agent-work-header');
    await expect(header).toContainText('Cursor');
    await expect(header).toContainText(workTitle);
    await expect(header).toContainText('Queued');
    await expect(page.getByText('0 replies', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Open thread, Cloud Agent work/u })).toHaveClass(
        /button--secondary/u
    );

    // A Computer reporting progress updates the same header in place, with no
    // second Message: this is one record, not a transcript.
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(computer);
    const accepted = socketMessage(computer);
    sendBootstrap(computer, credential, 'complete');
    expect(await accepted).toMatchObject({ mode: 'ordinary' });

    computer.send(
        cloudAgentObservationFrame({
            activity: 'Reading the failing migration.',
            observedAt: new Date().toISOString(),
            runId: seeded.runId,
            status: 'running',
            workId: seeded.workId,
        })
    );
    await expect(header).toContainText('Running');
    await expect(page.getByTestId('cloud-agent-work-detail')).toContainText(
        'Reading the failing migration.'
    );

    // Inside the Thread the same record reads as the detailed card, in sequence
    // beneath the Agent's own words — which the card never replaced.
    await page.getByRole('button', { name: /^Open thread, Cloud Agent work/u }).click();
    const thread = page.getByRole('complementary', { name: 'Thread' });
    const conversation = thread.getByTestId('thread-conversation');
    const card = conversation
        .locator(`[data-message-id="${seeded.messageId}"]`)
        .getByTestId('cloud-agent-work-card');
    await expect(thread.getByTestId('thread-cloud-agent-carousel')).toHaveCount(0);
    await expect(thread.getByRole('heading', { name: /Cloud agents/u })).toHaveCount(0);
    await expect(card).toContainText('Running');
    await expect(card).toContainText('haus/haus');
    await expect(
        thread.getByText('Delegating the migration fix to a Cloud Agent.', { exact: true })
    ).toBeVisible();
    // The Thread pane states the work in the card alone; the old metadata panel
    // said the same facts a second time, above the anchor.
    await expect(thread.getByTestId('cloud-agent-work-header')).toHaveCount(0);

    computer.send(
        cloudAgentObservationFrame({
            branches: [
                {
                    branch: 'cursor/fix-migration',
                    pullRequestUrl: 'https://github.com/haus/haus/pull/482',
                    repository: 'haus/haus',
                    pullRequest: {
                        number: 482,
                        state: 'open',
                        additions: 18,
                        deletions: 7,
                        changedFiles: 3,
                        observedAt: new Date().toISOString(),
                    },
                },
            ],
            observedAt: new Date().toISOString(),
            runId: seeded.runId,
            status: 'completed',
            summary: 'Opened a pull request.',
            workId: seeded.workId,
        })
    );
    await expect(card).toContainText('Done');
    await expect(card).toContainText('cursor/fix-migration');
    await expect(card.getByTestId('cloud-agent-work-pull-request')).toContainText('PR #482');
    await expect(card.getByRole('button', { name: 'View PR' })).toBeVisible();
    await expect(card.getByTestId('cloud-agent-work-diff')).toContainText('3 files changed');
    await expect(card.getByTestId('cloud-agent-work-diff')).toContainText('+18');
    await expect(card.getByTestId('cloud-agent-work-diff')).toContainText('−7');
    await expect(card.getByText('Opened a pull request.')).toHaveCount(0);
    await page.reload();
    await expect(card).toContainText('Done');
    await expect(card.getByTestId('cloud-agent-work-diff')).toContainText('3 files changed');
    await page.screenshot({ path: testInfo.outputPath('cloud-agent-completed.png') });

    // Settled work leaves "Happening now", which lists only live work.
    await page.goto('/s/cloud-agent-work/inbox');
    await expect(page.getByRole('button', { name: new RegExp(workTitle, 'u') })).toHaveCount(0);

    // Work delegated inside somebody else's Thread hoists its status onto that
    // Thread's own surface in the Chat, so a reader scanning back sees that
    // something is still running under it without opening anything.
    const nested = await startCloudAgentWork({
        agentId: seeded.agentId,
        chatId: seeded.chatId,
        computerCredential: credential,
        content: 'Following up inside the thread.',
        repository: 'haus/haus',
        target: `#all:${seeded.messageId}`,
        title: 'Backfill the migration test',
    });
    computer.send(
        cloudAgentObservationFrame({
            observedAt: new Date().toISOString(),
            runId: nested.runId,
            status: 'running',
            workId: nested.work.id,
        })
    );

    await page.goto('/s/cloud-agent-work');
    await openChannel(page, 'all');
    const rows = page.getByTestId('thread-cloud-agent-rows');
    await expect(rows).toContainText('Backfill the migration test');
    await expect(rows).toContainText('Running');
    await expect(rows.getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: /^Open thread, Cloud Agent work/u }).click();
    const cards = conversation.getByTestId('cloud-agent-work-card');
    const nestedCard = conversation
        .locator(`[data-message-id="${nested.messageId}"]`)
        .getByTestId('cloud-agent-work-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(workTitle);
    await expect(cards.nth(1)).toContainText('Backfill the migration test');
    await expect(nestedCard).toContainText('Running');
    await page.setViewportSize({ width: 1280, height: 400 });
    const initialTop = await card.evaluate((element) => element.getBoundingClientRect().top);
    await conversation.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect
        .poll(() => conversation.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    await expect
        .poll(() => card.evaluate((element) => element.getBoundingClientRect().top))
        .toBeLessThan(initialTop);
    await expect(nestedCard).toBeInViewport();
    computer.send(
        cloudAgentObservationFrame({
            observedAt: new Date().toISOString(),
            runId: nested.runId,
            status: 'completed',
            summary: 'Finished the follow-up.',
            workId: nested.work.id,
        })
    );
    await expect(rows).toContainText('Done');
    await expect(nestedCard).toContainText('Done');
    await expect(rows).not.toContainText('Backfill the migration test');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(workTitle);
    await expect(cards.nth(1)).toContainText('Backfill the migration test');
    await page.reload();
    await expect(rows).not.toContainText('Backfill the migration test');
    await expect(rows).toContainText('Done');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(workTitle);
    await expect(cards.nth(1)).toContainText('Backfill the migration test');
    await page.screenshot({ path: testInfo.outputPath('cloud-agent-inline.png') });
    computer.close();
});
