import { workerObservationFrame, seedWorker } from '../support/agent-worker.ts';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { createTestServer, openHappeningNow } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const workTitle = 'Fix the failing migration';
const credential = 'computer-worker-credential-1234567890ab';

test('Worker reads as one card in the Chat and the Inbox', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const { server, session } = await createTestServer(page, {
        displayName: 'Worker Work',
        slug: 'worker',
    });
    const seeded = await seedWorker({
        agentHandle: 'orbit',
        channelName: 'haus',
        computerCredential: credential,
        content: 'Delegating the migration fix to a Worker.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug: 'worker',
        startingRef: 'main',
        title: workTitle,
        token: session.accessToken,
    });

    // The Inbox is where background work that outlives a turn stays visible.
    await page.goto('/s/worker/inbox');
    // Happening now rows are pressable cards named by their title, not grid rows.
    const happeningNow = await openHappeningNow(page);
    const inboxRow = happeningNow.getByRole('button', { name: new RegExp(workTitle, 'u') });
    await expect(inboxRow).toBeVisible();
    // No Run has reported yet, so the queued launch reads as its stage.
    await expect(inboxRow).toContainText('Starting');
    await expect(inboxRow).toContainText('#haus');
    await expect(inboxRow).toContainText('Orbit');

    await page.goto(`/s/worker/tasks/${seeded.taskKey}`);
    const transcriptCard = page
        .locator(`[data-message-id="${seeded.messageId}"]`)
        .getByTestId('worker-card');
    await expect(transcriptCard).toContainText(workTitle);
    await expect(transcriptCard).toContainText('Starting');
    await expect(transcriptCard).not.toContainText('Queued');
    await expect(transcriptCard).toContainText('haus/haus');
    await expect(page.getByRole('button', { name: /— Worker actions$/u })).toHaveCount(0);
    await expect(page.getByText('0 replies', { exact: true })).toHaveCount(0);
    await expect(transcriptCard).not.toContainText('Delegated by');
    const cardWidth = await transcriptCard.evaluate(
        (element) => element.getBoundingClientRect().width
    );
    // It fills the shared in-chat column (`--chat-card-width`, 36rem), the
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
        workerObservationFrame({
            activity: 'Reading the failing migration.',
            observedAt: new Date().toISOString(),
            turnId: seeded.turnId,
            status: 'running',
            workerId: seeded.workerId,
        })
    );
    await expect(transcriptCard).toContainText('Working');
    await expect(transcriptCard.getByTestId('worker-status-line')).toContainText(
        'Reading the failing migration.'
    );

    computer.send(
        workerObservationFrame({
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
            turnId: seeded.turnId,
            status: 'completed',
            summary: 'Opened a pull request.',
            workerId: seeded.workerId,
        })
    );
    await expect(transcriptCard).toContainText('Done');
    const pullRequest = transcriptCard.getByTestId('worker-pull-request');
    await expect(pullRequest).toContainText('PR #482');
    await expect(pullRequest).toContainText('Open · 3 files');
    await expect(pullRequest).toContainText('+18');
    await expect(pullRequest).toContainText('−7');
    await expect(transcriptCard.getByRole('button', { name: 'View PR' })).toBeVisible();
    await expect(transcriptCard.getByRole('button', { name: 'Open in Cursor' })).toBeVisible();
    await expect(transcriptCard.getByText('Opened a pull request.')).toHaveCount(0);
    await page.reload();
    await expect(transcriptCard).toContainText('Done');
    await expect(transcriptCard.getByTestId('worker-pull-request')).toContainText('3 files');
    await page.screenshot({ path: testInfo.outputPath('worker-completed.png') });

    // Settled work leaves "Happening now", which lists only live work.
    await page.goto('/s/worker/inbox');
    await expect(page.getByRole('complementary', { name: 'Captain activity' })).toBeVisible();
    await expect(page.getByRole('button', { name: /running now$/u })).toHaveCount(0);
    computer.close();
});
