import { seedWorker, workerObservationFrame } from '../support/agent-worker.ts';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { createProjectWithAgents } from '../support/project.ts';
import { createTestServer, openHappeningNow } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const workTitle = 'Fix the failing migration';
const credential = 'computer-worker-credential-1234567890ab';

test('a Worker lives on its Task, and its report lands in the Task chat', async ({ page }) => {
    test.setTimeout(90_000);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Worker Work',
        slug: 'worker',
    });
    await createProjectWithAgents(client, {
        agentIds: [],
        name: 'migrations',
        serverId: server.id,
    });
    const seeded = await seedWorker({
        agentHandle: 'orbit',
        brief: 'Make the failing migration pass and open a pull request.',
        channelName: 'migrations',
        computerCredential: credential,
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug: 'worker',
        startingRef: 'main',
        title: workTitle,
        token: session.accessToken,
    });

    await page.goto('/s/worker/inbox');
    const happeningNow = await openHappeningNow(page);
    const inboxRow = happeningNow.getByRole('button', { name: new RegExp(workTitle, 'u') });
    await expect(inboxRow).toContainText('Starting');
    await expect(inboxRow).toContainText(seeded.taskKey);
    await expect(inboxRow).toContainText('Orbit');
    await inboxRow.click();
    await expect(page).toHaveURL(new RegExp(`/s/worker/tasks/${seeded.taskKey}$`, 'u'));

    const workers = page.getByRole('grid', { name: 'Workers' });
    const row = workers.getByTestId('worker-row');
    await expect(row).toContainText(workTitle);
    await expect(row).toContainText('Cursor');
    await expect(row.getByRole('img', { name: 'Queued' })).toBeVisible();
    await expect(page.getByTestId('worker-report-notice')).toHaveCount(0);

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
            status: 'running',
            turnId: seeded.turnId,
            workerId: seeded.workerId,
        })
    );
    await expect(row.getByRole('img', { name: 'Working' })).toBeVisible();

    const pullRequestUrl = 'https://github.com/haus/haus/pull/482';
    computer.send(
        workerObservationFrame({
            branches: [
                {
                    branch: 'cursor/fix-migration',
                    pullRequest: {
                        additions: 18,
                        changedFiles: 3,
                        deletions: 7,
                        number: 482,
                        observedAt: new Date().toISOString(),
                        state: 'open',
                    },
                    pullRequestUrl,
                    repository: 'haus/haus',
                },
            ],
            observedAt: new Date().toISOString(),
            result: {
                outcome: 'done',
                personHandle: null,
                pullRequestUrls: [pullRequestUrl],
                text: 'The migration passes now. I opened a pull request.',
            },
            status: 'completed',
            turnId: seeded.turnId,
            workerId: seeded.workerId,
        })
    );
    await expect(row.getByRole('img', { name: 'Done' })).toBeVisible();
    const notice = page.getByTestId('worker-report-notice');
    await expect(notice).toContainText(`${workTitle}finished`);
    await expect(page.getByText('The migration passes now. I opened a pull request.')).toHaveCount(
        0
    );
    await expect(page.getByRole('grid', { name: 'Pull requests' })).toContainText('482');

    await notice.getByRole('button', { name: workTitle }).click();
    await expect(page).toHaveURL(new RegExp(`/s/worker/workers/${seeded.workerId}$`, 'u'));
    await expect(
        page.getByText('The migration passes now. I opened a pull request.')
    ).toBeVisible();

    await page.goto('/s/worker/inbox');
    await expect(page.getByRole('button', { name: /running now$/u })).toHaveCount(0);
    computer.close();
});
