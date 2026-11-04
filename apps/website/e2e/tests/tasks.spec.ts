import type { Page } from '@playwright/test';
import { e2eHumanUserId } from '../support/app-session.ts';
import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('hosted claim board survives reconnect and loses claims with parent Chat access', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Hosted Tasks',
        slug: 'tasks',
    });
    await page.goto('/s/tasks/tasks');

    await page.getByRole('button', { name: 'New task' }).click();
    // Pin the anchor Chat: the dialog defaults to the most recently active
    // chat, which on a fresh Server is Cove's onboarding channel once its
    // first message lands — a race this test must not depend on.
    await page.getByRole('button', { name: /Chat/u }).click();
    await page.getByRole('option', { name: '#all' }).click();
    await page.getByPlaceholder('What needs to be done?').fill('Prove the hosted task flow');
    await page.getByRole('button', { name: 'Create task' }).click();

    // The default lens is the Linear-style list, and opening a row shows the
    // claim Thread in a dialog over the Tasks page rather than navigating.
    await page.getByRole('button', { name: /Open claim #1 Prove the hosted task flow/u }).click();
    const dialog = page.getByRole('dialog', { name: 'Claim #1 thread' });
    await expect(dialog.getByRole('region', { name: 'Claim #1 details' })).toBeVisible();
    await expect(dialog.getByText('Prove the hosted task flow', { exact: true })).toBeVisible();
    // The dialog holds two scroll containers (claim details above the anchor,
    // and the Thread itself); the horizontal-overflow claim is about the Thread.
    const threadViewport = dialog.getByTestId('thread-conversation');
    await expect
        .poll(() => threadViewport.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBeLessThanOrEqual(0);
    await dialog.getByRole('button', { name: 'Close thread' }).click();
    await expect(dialog).toHaveCount(0);

    // Inline metadata controls live on the board cards, so switch lenses for
    // the control flow below. The lens lives in the topbar's display menu.
    await selectTaskLens(page, 'Board');

    let card = claimCard(page);
    await expect(card).toBeVisible();
    // Claims are Agent work: a person hands a claim to an Agent, never takes it.
    await expect(card.getByRole('button', { exact: true, name: 'Claim' })).toHaveCount(0);

    const status = claimControl(card, 'Status');
    await status.click();
    await page.getByRole('option', { name: 'In progress' }).click();
    card = claimCard(page);
    await expect(claimControl(card, 'Status')).toContainText('In progress');

    await page.getByRole('button', { name: 'Manage Labels' }).click();
    await page.getByLabel('New task label').fill('backend');
    await page.getByRole('button', { name: 'Add label' }).click();
    const renameLabel = page.getByLabel('Rename backend');
    await renameLabel.fill('review');
    await renameLabel.press('Enter');
    await expect(page.getByLabel('Rename review')).toBeVisible();
    const labelRow = page.getByLabel('Rename review').locator('xpath=ancestor::li');
    await labelRow.getByRole('button', { name: /^Color:/u }).click();
    await page.getByRole('button', { name: 'Purple' }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    card = claimCard(page);
    const priority = claimControl(card, 'Priority');
    await priority.click();
    await page.getByRole('option', { name: 'Urgent' }).click();
    await expect(claimControl(claimCard(page), 'Priority')).toContainText('Urgent');
    await claimCard(page).getByRole('button', { name: 'Labels for claim #1' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'review' }).click();
    await expect(claimCard(page).getByText('review', { exact: true })).toBeVisible();

    // Any member of the Chat may hand the claim to one of its Agents; the
    // picker lists Agents only.
    await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'tasks',
        token: session.accessToken,
    });
    await page.reload();
    card = claimCard(page);
    await claimControl(card, 'Assignee').click();
    await expect(page.getByRole('option', { name: /member$/u })).toHaveCount(0);
    await page.getByRole('option', { name: /Orbit\s*@orbit$/u }).click();
    await expect(claimControl(claimCard(page), 'Assignee')).toContainText('Orbit');

    const snapshot = await client.claim.list.query({ serverId: server.id });
    const claim = snapshot.claims[0]?.claim;
    if (!claim) {
        throw new Error('The hosted claim flow did not resolve its claim.');
    }

    await page.context().setOffline(true);
    await client.claim.assign.mutate({
        assignee: null,
        expectedVersion: claim.version,
        messageId: claim.messageId,
        serverId: server.id,
    });
    await page.context().setOffline(false);
    await expect(claimControl(claimCard(page), 'Assignee')).toContainText('Unassigned');

    const userId = runPsql(
        session.databaseUrl,
        `select id from users where id = '${e2eHumanUserId}'`
    );
    runPsql(
        session.databaseUrl,
        `delete from channel_participants
         where server_id = '${server.id}' and user_id = '${userId}'`
    );
    await page.reload();
    await expect(page.getByText('No tasks yet')).toBeVisible();
    await expect(page.getByText('Prove the hosted task flow', { exact: true })).toHaveCount(0);
});

test('a hosted claim message projects its status in the Chat and opens its Thread', async ({
    page,
}) => {
    const { client, server } = await createTestServer(page, {
        displayName: 'Claim Projection',
        slug: 'claim-projection',
    });
    await openChannel(page, 'all');

    await page.getByRole('textbox', { name: 'Message all' }).fill('Projected claim message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Projected claim message', { exact: true })).toBeVisible();

    const allChatId = server.channels.find((chat) => chat.name === 'all')?.id;
    if (!allChatId) {
        throw new Error('The claim projection flow did not resolve #all.');
    }
    // The visible row above may still be the optimistic one, so wait for the
    // Server to own the message before promoting it.
    await expect
        .poll(async () => {
            const snapshot = await client.chat.messages.query({
                chatId: allChatId,
                serverId: server.id,
            });
            return snapshot.messages.some(
                (message) => message.content === 'Projected claim message'
            );
        })
        .toBe(true);
    const snapshot = await client.chat.messages.query({ chatId: allChatId, serverId: server.id });
    const anchor = snapshot.messages.find(
        (message) => message.content === 'Projected claim message'
    );
    if (!anchor) {
        throw new Error('The claim projection flow did not resolve its anchor message.');
    }

    const promotion = await client.claim.promote.mutate({
        messageId: anchor.id,
        serverId: server.id,
    });

    await expect(page.getByText('Projected claim message', { exact: true })).toBeVisible();
    // Claim identity is the header of the recessed Thread surface beneath the
    // message — the same slot Cloud Agent work uses — and that whole
    // surface is the way into the work. The author line carries provenance only.
    const chip = page.getByTestId('message-claim-chip');
    const openThread = page.getByRole('button', { name: /^Open thread, Claim #1/u });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Claim #1');
    await expect(page.getByTestId('message-claim-mark')).toHaveCount(0);
    await expect(openThread).toBeVisible();

    // A status change rides the same claim realtime invalidation; no reload.
    await client.claim.update.mutate({
        expectedVersion: promotion.claim.version,
        messageId: anchor.id,
        patch: { status: 'in_progress' },
        serverId: server.id,
    });
    await expect(chip).toContainText('In progress');

    await openThread.click();
    const thread = page.getByRole('complementary', { name: 'Thread' });
    await expect(thread).toBeVisible();
    await expect(thread.getByRole('region', { name: 'Claim #1 details' })).toBeVisible();
    // The panel above the anchor states the claim in full, so the anchor's own
    // chip would say every word of it twice.
    await expect(thread.getByTestId('message-claim-chip')).toHaveCount(0);
    await expect(thread.getByRole('button', { name: 'Status for claim #1' })).toContainText(
        'In progress'
    );
});

function claimCard(page: Page) {
    return page.getByRole('row', { exact: true, name: 'Prove the hosted task flow' });
}

function claimControl(
    card: ReturnType<typeof claimCard>,
    name: 'Assignee' | 'Priority' | 'Status'
) {
    return card.getByRole('button', { name: new RegExp(`${name} for claim #1$`, 'u') });
}

/** The list/board lens lives behind the topbar's display-options menu. */
async function selectTaskLens(page: Page, lens: 'Board' | 'List') {
    await page.getByRole('button', { name: 'Display options' }).click();
    await page.getByLabel('Task layout').getByText(lens).click();
    await page.keyboard.press('Escape');
}
