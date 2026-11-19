import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import {
    assertOpaqueId,
    completeOnboarding,
    createClient,
    openChannel,
    openSection,
    runPsql,
} from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const peer = await createAppTestFixture('peer');
    const owner = createClient(accessToken);
    const peerClient = createClient(peer.accessToken);
    await owner.server.create.mutate({
        displayName: 'Hosted Messages',
        slug: 'hosted-messages',
    });
    await peerClient.server.create.mutate({
        displayName: 'Hosted Peer Root',
        slug: 'hosted-peer-root',
    });
    const openedServer = await owner.server.bySlug.query({ slug: 'hosted-messages' });
    const serverId = openedServer.id;
    const allChatId = openedServer.channels.find((channel) => channel.name === 'haus')?.id;
    const peerUserId = runPsql(databaseUrl, "select id from users where id = 'usr_e2e_peer'");
    assertOpaqueId(serverId);
    assertOpaqueId(allChatId);
    assertOpaqueId(peerUserId);
    completeOnboarding(databaseUrl, serverId);
    runPsql(
        databaseUrl,
        `insert into server_memberships (id, server_id, user_id, role)
         values ('mem_e2e_peer', '${serverId}', '${peerUserId}', 'member');
         insert into channel_participants (server_id, chat_id, user_id)
         values ('${serverId}', '${allChatId}', '${peerUserId}')`
    );
    await owner.chat.send.mutate({
        chatId: allChatId,
        content: 'First durable human message',
        nonce: 'e2e-owner-baseline-message',
        serverId,
    });
    await peerClient.chat.send.mutate({
        chatId: allChatId,
        content: 'Peer-authored hosted message',
        nonce: 'e2e-peer-message',
        serverId,
    });
    seedArtifactReply({ chatId: allChatId, databaseUrl, serverId });
    seedReferenceFixture({ chatId: allChatId, databaseUrl, serverId });
});

test('a human messages in #haus with only the hosted Server online', async ({ page }) => {
    test.setTimeout(60_000);
    const localProductRequests: string[] = [];
    const retiredLocalOrigins = ['http://127.0.0.1:8080', 'http://127.0.0.1:18790'];

    page.on('request', (request) => {
        if (retiredLocalOrigins.some((origin) => request.url().startsWith(origin))) {
            localProductRequests.push(request.url());
        }
    });

    await signInAsAppHuman(page);
    await page.goto('/s/hosted-messages');
    await openChannel(page, 'haus');

    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill('/status check');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(composer).toHaveText('/status check');
    await composer.fill('');
    await composer.fill('Browser-authored durable message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Browser-authored durable message')).toBeVisible();
    const readState = page.getByTestId('read-state').filter({ visible: true }); // kept Chats hide
    await expect(readState).toContainText(/Read through \d+/u);
    await page.reload();
    await openChannel(page, 'haus');
    await expect(page.getByText('Browser-authored durable message')).toBeVisible();
    await composer.fill('Second durable human message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Second durable human message', { exact: true })).toBeVisible();

    const fileChooser = page.waitForEvent('filechooser');
    await page.getByLabel('Add attachments', { exact: true }).click();
    await (
        await fileChooser
    ).setFiles({
        buffer: Buffer.from('hosted attachment bytes'),
        mimeType: 'text/plain',
        name: 'hosted-note.txt',
    });
    await expect(page.getByText('hosted-note.txt')).toBeVisible();
    await page.getByRole('button', { name: 'Send' }).click();
    const downloadButton = page.getByRole('button', { name: 'Download hosted-note.txt' });
    await expect(downloadButton).toBeVisible();
    const download = page.waitForEvent('download');
    await downloadButton.click();
    expect((await download).suggestedFilename()).toBe('hosted-note.txt');

    await expect(page.getByText('First durable human message', { exact: true })).toBeVisible();
    await expect(page.getByText('Second durable human message', { exact: true })).toBeVisible();

    // The sidebar renders as a treegrid, so its search row is a row, not a button.
    await page.getByRole('row', { name: 'Search', exact: true }).click();
    await page.getByPlaceholder('Search or run a command').fill('First durable');
    await page.getByText('See all results').click();
    // Results render as ItemCard buttons whose accessible name carries the
    // channel, author, and time alongside the matched text.
    await expect(page.getByRole('button', { name: /First durable human message/ })).toBeVisible();
    await openSection(page, 'Chat');
    await openChannel(page, 'haus');

    const peerMessage = page.getByText('Peer-authored hosted message', { exact: true });
    await expect(peerMessage).toBeVisible();
    expect(localProductRequests).toEqual([]);
});

test('signing out closes authenticated routes and returns to sign in', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto('/s/hosted-messages/settings/profile');
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toHaveCount(0);
});

test('an Agent-authored page fence in an inline reply opens the chat Workspace pane', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto('/s/hosted-messages');
    await openChannel(page, 'haus');
    await page.setViewportSize({ height: 720, width: 800 });

    const composer = page.getByRole('textbox', { name: 'Message all' });
    await expect(page.getByText('```page', { exact: false })).toHaveCount(0);
    await composer.fill('Preserved draft');
    await page.getByTestId('artifact-card').press('Enter');

    const artifacts = page.getByRole('complementary', { name: 'Workspace' });
    await expect(artifacts).toBeVisible();
    await expect(artifacts.getByRole('tab', { name: 'deterministic.html' })).toBeVisible();
    await expect(artifacts.getByText('Unable to browse this workspace.')).toBeVisible();

    await artifacts.getByRole('button', { name: 'Hide workspace' }).click();
    await expect(composer).toHaveText('Preserved draft');
});

test('inline replies reach an open Channel live and catch up after reconnect', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto('/s/hosted-messages');
    await openChannel(page, 'haus');

    const anchorText = 'First durable human message';
    const anchorRow = page
        .getByText(anchorText, { exact: true })
        .locator('xpath=ancestor::div[@data-message-id][1]');
    await anchorRow.hover();
    await page.getByRole('button', { name: 'Reply', exact: true }).first().click();
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await expect(composer).toBeFocused();
    await composer.fill('First inline reply');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('First inline reply', { exact: true })).toBeVisible();

    const ownerFixture = await createAppTestFixture();
    const peerFixture = await createAppTestFixture('peer');
    const owner = createClient(ownerFixture.accessToken);
    const peer = createClient(peerFixture.accessToken);
    const server = await owner.server.bySlug.query({ slug: 'hosted-messages' });
    const chatId = server.channels.find((channel) => channel.name === 'haus')?.id;
    if (!chatId) {
        throw new Error('The inline reply test did not resolve #haus.');
    }
    const snapshot = await owner.chat.messages.query({ chatId, serverId: server.id });
    const anchor = snapshot.messages.find((message) => message.content === anchorText);
    if (!anchor) {
        throw new Error('The inline reply test did not resolve its parent Message.');
    }

    await peer.chat.send.mutate({
        chatId,
        content: 'Live peer inline reply',
        nonce: 'e2e-inline-live-reply',
        replyToMessageId: anchor.id,
        serverId: server.id,
    });
    await expect(page.getByText('Live peer inline reply', { exact: true })).toBeVisible();

    await page.context().setOffline(true);
    await peer.chat.send.mutate({
        chatId,
        content: 'Inline reply sent while the App was offline',
        nonce: 'e2e-inline-offline-reply',
        replyToMessageId: anchor.id,
        serverId: server.id,
    });
    await page.context().setOffline(false);

    await expect(
        page.getByText('Inline reply sent while the App was offline', { exact: true })
    ).toBeVisible();
});

test('Agent-authored typed references render as interactive Agent and Chat chips', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto('/s/hosted-messages');
    await openChannel(page, 'haus');

    const message = page.locator('[data-message-id="msg_e2e_reference"]');
    await expect(message).toBeVisible();

    const chips = message.locator('[data-slot="chip"]');
    await expect(chips).toHaveCount(3);

    const blippyChip = chips.filter({ hasText: /blippy/iu });
    const tinyChip = chips.filter({ hasText: /tiny/iu });
    const productChip = chips.filter({ hasText: /product/iu });
    for (const chip of [blippyChip, tinyChip, productChip]) {
        await expect(chip).toHaveCount(1);
        expect(
            await chip.evaluate((element) => Boolean(element.closest('a, button, [role="button"]')))
        ).toBe(true);
    }

    await blippyChip.click();
    await expect(page).toHaveURL(/\/s\/hosted-messages\/agents\/[^/]+\/home$/u);
    await expect(page.getByText('Blippy', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Captain profile' })).toHaveCount(0);

    await page.goBack();
    await expect(message).toBeVisible();
    await productChip.click();
    await expect(page).toHaveURL(/\/s\/hosted-messages\/chats\/cht_e2e_product$/u);
    await expect(page.getByRole('textbox', { name: 'Message product' })).toBeVisible();
});

function seedArtifactReply(input: { chatId: string; databaseUrl: string; serverId: string }) {
    runPsql(
        input.databaseUrl,
        `begin;
         insert into agents (
           id, server_id, handle, display_name, home_timezone
         ) values (
           'agt_e2e_artifact', '${input.serverId}', 'artifact-auditor',
           'Artifact Auditor', 'America/New_York'
         );
         insert into channel_agent_participants (server_id, chat_id, agent_id)
         values ('${input.serverId}', '${input.chatId}', 'agt_e2e_artifact');
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_user_id, content, nonce
         )
         select
           'msg_e2e_artifact_anchor', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1,
           (
             select user_id from server_memberships
             where server_id = '${input.serverId}' and role = 'owner'
           ),
           'Agent artifact fixture', 'e2e-artifact-anchor'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_agent_id, content, nonce,
           reply_to_message_id, reply_root_message_id
         )
         select
           'msg_e2e_artifact_reply', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1,
           'agt_e2e_artifact',
           E'Here is the audit.\\n\\u0060\\u0060\\u0060page\\n{"path":"audits/deterministic.html","title":"Deterministic workspace audit"}\\n\\u0060\\u0060\\u0060',
           'e2e-artifact-reply', 'msg_e2e_artifact_anchor', 'msg_e2e_artifact_anchor'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         commit;`
    );
}

function seedReferenceFixture(input: { chatId: string; databaseUrl: string; serverId: string }) {
    runPsql(
        input.databaseUrl,
        `begin;
         insert into computers (
           id, server_id, attached_by_user_id, credential_hash, health
         ) values
           (
             'cmp_e2e_ref_blippy00', '${input.serverId}',
             (select user_id from server_memberships where server_id = '${input.serverId}' and role = 'owner'),
             repeat('a', 64), 'offline'
           ),
           (
             'cmp_e2e_ref_tiny0000', '${input.serverId}',
             (select user_id from server_memberships where server_id = '${input.serverId}' and role = 'owner'),
             repeat('b', 64), 'offline'
           );
         insert into agents (
           id, server_id, computer_id, handle, display_name, home_timezone,
           desired_runtime_id, desired_model_id
         ) values
           (
             'agt_e2e_blippy', '${input.serverId}', 'cmp_e2e_ref_blippy00',
             'blippy', 'Blippy', 'America/New_York', 'codex', 'gpt-5.6-sol'
           ),
           (
             'agt_e2e_tiny', '${input.serverId}', 'cmp_e2e_ref_tiny0000',
             'tiny', 'Tiny', 'America/New_York', 'codex', 'gpt-5.6-sol'
           );
         insert into chats (id, server_id, kind, is_all, name)
         values ('cht_e2e_product', '${input.serverId}', 'channel', false, 'product');
         insert into channel_participants (server_id, chat_id, user_id)
         select '${input.serverId}', 'cht_e2e_product', user_id
         from server_memberships
         where server_id = '${input.serverId}' and role = 'owner';
         insert into channel_agent_participants (server_id, chat_id, agent_id)
         values
           ('${input.serverId}', '${input.chatId}', 'agt_e2e_blippy'),
           ('${input.serverId}', '${input.chatId}', 'agt_e2e_tiny'),
           ('${input.serverId}', 'cht_e2e_product', 'agt_e2e_blippy'),
           ('${input.serverId}', 'cht_e2e_product', 'agt_e2e_tiny');
         insert into chat_messages (
           id, server_id, chat_id, sequence, author_agent_id, content, nonce
         )
         select
           'msg_e2e_reference', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1,
           'agt_e2e_blippy',
           'Coordinate with [@blippy](agent://agt_e2e_blippy), [@tiny](agent://agt_e2e_tiny), and [#product](chat://cht_e2e_product).',
           'e2e-reference-message'
         from chats
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         commit;`
    );
}

test('a signed-out human cannot read hosted messages', async ({ page }) => {
    await page.goto('/s/hosted-messages');

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByText('First durable human message')).toHaveCount(0);
});

test('Haus App never requests a retired local product endpoint', async ({ page }) => {
    const localServerOrigin = 'http://127.0.0.1:8080';
    const localRequests: string[] = [];

    page.on('request', (request) => {
        if (request.url().startsWith(`${localServerOrigin}/trpc/`)) {
            localRequests.push(request.url());
        }
    });

    await signInAsAppHuman(page);
    await page.goto('/s/hosted-messages');
    await openChannel(page, 'haus');
    await expect(page.getByText('First durable human message')).toBeVisible();
    expect(localRequests).toEqual([]);
});
