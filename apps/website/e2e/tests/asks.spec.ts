import { seedOpenAsk } from '../support/agent-ask.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const askTitle = 'Run the staged migration?';
const recommendation = 'Approve the staged migration';
const alternative = 'Hold until Monday';

test('an open Ask leads the Inbox, and its options answer in the Thread peek', async ({ page }) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Hosted Asks',
        slug: 'asks',
    });
    await client.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId: server.id,
    });
    const seeded = await seedOpenAsk({
        addresseeHandle: 'ada',
        agentHandle: 'orbit',
        channelName: 'all',
        content: 'The migration is staged. Should I run it now?',
        databaseUrl: session.databaseUrl,
        options: [recommendation, alternative],
        serverId: server.id,
        slug: 'asks',
        summary: 'The migration is staged and reversible for one hour.',
        title: askTitle,
        token: session.token,
    });

    await page.goto('/s/asks');
    await openChannel(page, 'all');
    const attachment = page.getByRole('button', { exact: true, name: 'Open thread, Ask' });
    await expect(attachment).toBeVisible();
    await expect(attachment).toContainText('Awaiting answer');
    await expect(page.getByText('0 replies', { exact: true })).toHaveCount(0);
    await attachment.click();
    await expect(page.getByRole('complementary', { name: 'Thread' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Answer ask' })).toBeVisible();
    await expect(page.getByRole('button', { exact: true, name: recommendation })).toBeVisible();

    // The row states the Ask and opens it. It carries no control of its own,
    // so no option is pressable until the Ask itself is open.
    await page.goto('/s/asks/inbox');
    const row = page.getByRole('button', { exact: true, name: askTitle });
    await expect(row).toBeVisible();
    await expect(row).toContainText('The migration is staged and reversible for one hour.');
    await expect(page.getByRole('button', { exact: true, name: recommendation })).toHaveCount(0);

    // The options live in the peek, where the question and its reasoning are
    // readable, and the Agent's recommendation leads them emphasized.
    await row.click();
    const recommended = page.getByRole('button', { exact: true, name: recommendation });
    const held = page.getByRole('button', { exact: true, name: alternative });
    await expect(recommended).toBeVisible();
    await expect(held).toBeVisible();
    await expect(recommended).toHaveClass(/button--primary/u);
    await expect(held).toHaveClass(/button--secondary/u);

    // Pressing an option is the human answering in their own words — the exact
    // option text, authored by them, in the Ask's Thread. The Server settles
    // the Ask as a side effect, so the row and the peek both leave on its event.
    await recommended.click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText('Nothing needs you.')).toBeVisible();

    const thread = await client.chat.messages.query({
        chatId: seeded.threadChatId,
        serverId: server.id,
    });
    const answer = thread.messages.at(-1);
    expect(answer?.content).toBe(recommendation);
    expect(answer?.author.kind).toBe('human');

    // Settlement removes the Ask attachment while keeping the conversation.
    await page.goto('/s/asks');
    await openChannel(page, 'all');
    const askRow = page
        .getByText('The migration is staged. Should I run it now?', { exact: true })
        .locator('xpath=ancestor::div[@data-message-id][1]');
    await expect(askRow.getByTestId('message-ask-marker')).toHaveCount(0);
    await expect(
        askRow.getByRole('button', { name: 'Open thread, 1 reply', exact: true })
    ).toBeVisible();
});
