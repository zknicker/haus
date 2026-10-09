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

test('Cloud Agent work reads as one card in the Chat and in its Thread', async ({
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
    await expect(inboxRow).toContainText('Working');
    await expect(inboxRow).toContainText('#all');
    await expect(inboxRow).toContainText('Orbit');

    // The Chat carries the same work card the Thread does, column-wide and
    // with its actions inline: no detached overflow menu beside it.
    await page.goto('/s/cloud-agent-work');
    await openChannel(page, 'all');
    const transcriptCard = page
        .locator(`[data-message-id="${seeded.messageId}"]`)
        .getByTestId('cloud-agent-work-card');
    await expect(transcriptCard).toContainText(workTitle);
    await expect(transcriptCard).toContainText('Working');
    await expect(transcriptCard).not.toContainText('Queued');
    await expect(transcriptCard).toContainText('haus/haus');
    await expect(page.getByRole('button', { name: /— Cloud Agent actions$/u })).toHaveCount(0);
    await expect(page.getByText('0 replies', { exact: true })).toHaveCount(0);
    // The card carries no way into the Thread and no delegation receipt: the
    // Message's author line above it already says who and when, and its hover
    // action opens the Thread.
    await expect(transcriptCard.getByRole('button', { name: /^Open thread/u })).toHaveCount(0);
    await expect(transcriptCard).not.toContainText('Delegated by');
    const cardWidth = await transcriptCard.evaluate(
        (element) => element.getBoundingClientRect().width
    );
    // It fills the shared in-chat column (`--chat-card-width`, 36rem), the
    // same edge a thread preview under the Message lands on.
    expect(cardWidth).toBeCloseTo(36 * 16, 0);

    // A Computer reporting progress updates the same card in place, with no
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
    await expect(transcriptCard).toContainText('Working');
    await expect(transcriptCard.getByTestId('cloud-agent-work-status-line')).toContainText(
        'Reading the failing migration.'
    );

    // Inside the Thread the same card reads in sequence beneath the Agent's own
    // words — which the card never replaced — without a way into itself.
    const anchorRow = transcriptCard.locator(
        'xpath=ancestor::*[@data-slot="chat-message-assistant"][1]'
    );
    await anchorRow.hover();
    await anchorRow.locator('button[aria-label="Reply in thread"]').click();
    const thread = page.getByRole('complementary', { name: 'Thread' });
    const conversation = thread.getByTestId('thread-conversation');
    const card = conversation
        .locator(`[data-message-id="${seeded.messageId}"]`)
        .getByTestId('cloud-agent-work-card');
    await expect(thread.getByTestId('thread-cloud-agent-carousel')).toHaveCount(0);
    await expect(thread.getByRole('heading', { name: /Cloud agents/u })).toHaveCount(0);
    await expect(card).toContainText('Working');
    await expect(card).toContainText('haus/haus');
    await expect(
        thread.getByText('Delegating the migration fix to a Cloud Agent.', { exact: true })
    ).toBeVisible();
    await expect(card.getByRole('button', { name: /^Open thread/u })).toHaveCount(0);
    await expect(card).not.toContainText('Delegated by');

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
    const pullRequest = card.getByTestId('cloud-agent-work-pull-request');
    await expect(pullRequest).toContainText('PR #482');
    await expect(pullRequest).toContainText('Open · 3 files');
    await expect(pullRequest).toContainText('+18');
    await expect(pullRequest).toContainText('−7');
    await expect(card.getByRole('button', { name: 'View PR' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Open in Cursor' })).toBeVisible();
    await expect(card.getByText('Opened a pull request.')).toHaveCount(0);
    await page.reload();
    await expect(card).toContainText('Done');
    await expect(card.getByTestId('cloud-agent-work-pull-request')).toContainText('3 files');
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
    await expect(rows).toContainText('Working');
    await expect(rows.getByRole('button')).toHaveCount(0);
    // Once replies exist the Thread preview below the card is the way in.
    await page.getByRole('button', { name: /^Open thread, Cloud Agent work/u }).click();
    const cards = conversation.getByTestId('cloud-agent-work-card');
    const nestedCard = conversation
        .locator(`[data-message-id="${nested.messageId}"]`)
        .getByTestId('cloud-agent-work-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(workTitle);
    await expect(cards.nth(1)).toContainText('Backfill the migration test');
    await expect(nestedCard).toContainText('Working');
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
    // One row per job, always named after its title.
    await expect(rows).toContainText('Backfill the migration test');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(workTitle);
    await expect(cards.nth(1)).toContainText('Backfill the migration test');
    await page.reload();
    await expect(rows).toContainText('Backfill the migration test');
    await expect(rows).toContainText('Done');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(workTitle);
    await expect(cards.nth(1)).toContainText('Backfill the migration test');
    await page.screenshot({ path: testInfo.outputPath('cloud-agent-inline.png') });
    computer.close();
});
