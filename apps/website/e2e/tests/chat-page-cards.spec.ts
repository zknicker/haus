import { routeAgentPageText } from '../support/artifact-transport.ts';
import { seedAgentPage } from '../support/artifacts.ts';
import { captainsProjectId } from '../support/project.ts';
import { createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const pagePath = 'agents/page-author/workbench/deterministic.html';

test('an Agent page card opens its Drive file beside the chat', async ({ page }) => {
    const slug = 'chat-page-cards';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Chat Page Cards',
        slug,
    });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    if (!chatId) {
        throw new Error('The page card test did not resolve #all.');
    }
    const agentId = `agt_${server.id}_pages`;
    const artifactId = `art_${server.id}_page`;
    seedPageMessage(session.databaseUrl, {
        agentId,
        chatId,
        homeProjectId: await captainsProjectId(client, server.id),
        revisionId: `${artifactId}_r1`,
        serverId: server.id,
    });
    seedAgentPage(session.databaseUrl, {
        agentId,
        id: artifactId,
        path: pagePath,
        serverId: server.id,
    });
    await routeAgentPageText(
        page,
        (revisionId) =>
            `<!doctype html><h1>${revisionId === `${artifactId}_r1` ? 'First draft' : 'Current audit'}</h1>`
    );
    await page.goto(`/s/${slug}/chats/${chatId}`);
    await page.setViewportSize({ height: 720, width: 1200 });

    const composer = page.getByRole('textbox', { name: 'Message all' });
    await expect(page.getByText('```page', { exact: false })).toHaveCount(0);
    await composer.fill('Preserved draft');
    await page.getByRole('button', { name: 'Open Deterministic audit' }).press('Enter');

    const pane = page.getByRole('complementary', { name: 'Workspace' });
    await expect(pane.getByRole('tab', { name: 'deterministic.html' })).toBeVisible();
    const current = pane.frameLocator('iframe[title="deterministic.html"]');
    await expect(current.getByRole('heading', { name: 'Current audit' })).toBeVisible();

    await page.getByRole('button', { name: 'Open First draft' }).click();
    const pinned = pane.frameLocator('iframe[title="deterministic.html"]');
    await expect(pinned.getByRole('heading', { name: 'First draft' })).toBeVisible();
    await expect(pane.getByRole('tab', { name: 'deterministic.html' })).toHaveCount(2);

    await page.getByRole('button', { name: 'Open Moved page' }).click();
    await expect(pane.getByText('This page was moved or deleted.')).toBeVisible();

    await pane.getByRole('button', { name: 'Hide workspace' }).click();
    await expect(composer).toHaveText('Preserved draft');
});

function seedPageMessage(
    databaseUrl: string,
    input: {
        agentId: string;
        chatId: string;
        homeProjectId: string;
        revisionId: string;
        serverId: string;
    }
) {
    const fence = (props: Record<string, string>) =>
        `\\n\\u0060\\u0060\\u0060page\\n${JSON.stringify(props).replaceAll('"', '\\"')}\\n\\u0060\\u0060\\u0060`;
    const content = [
        'Here is the audit.',
        fence({ path: `drive/${pagePath}`, title: 'Deterministic audit' }),
        fence({ path: `drive/${pagePath}`, revision: input.revisionId, title: 'First draft' }),
        fence({ path: 'drive/agents/page-author/workbench/moved.html', title: 'Moved page' }),
    ].join('');
    runPsql(
        databaseUrl,
        `begin;
         insert into agents (id, server_id, handle, display_name, home_timezone, home_project_id)
         values ('${input.agentId}', '${input.serverId}', 'page-author', 'Page Author', 'America/New_York',
           '${input.homeProjectId}');
         insert into channel_agent_participants (server_id, chat_id, agent_id)
         values ('${input.serverId}', '${input.chatId}', '${input.agentId}');
         insert into chat_messages (id, server_id, chat_id, sequence, author_agent_id, content, nonce)
         select 'msg_e2e_page_cards', '${input.serverId}', '${input.chatId}',
           last_message_sequence + 1, '${input.agentId}', E'${content}', 'e2e-page-cards'
         from chats where server_id = '${input.serverId}' and id = '${input.chatId}';
         update chats set last_message_sequence = last_message_sequence + 1
         where server_id = '${input.serverId}' and id = '${input.chatId}';
         commit;`
    );
}
