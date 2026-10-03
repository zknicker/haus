import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('deleting a legacy creation announcement detaches its link and preserves the Agent', async () => {
    const runner = await fixture.mintRunner('run_create_detach');

    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Tether', nonce: 'create-detach' })
    );

    expect(created.status).toBe(200);
    const agentId = created.body.agent?.agentId ?? '';
    const sent = await fixture.post('/api/agent/messages/send', runner, {
        content: 'Historical introduction.',
        nonce: 'legacy-announcement',
        target: '#product',
    });
    expect(sent.status).toBe(200);
    const [historical] = await fixture.harness.sql`
        select id from chat_messages where server_id = ${fixture.serverId} and nonce = 'legacy-announcement'
    `;
    // Arrange an existing production announcement from before creation was separated.
    await fixture.harness.sql`
        update chat_messages set body_kind = 'agent-created' where id = ${historical.id}
    `;
    await fixture.harness.sql`
        update agents set creation_message_id = ${historical.id} where id = ${agentId}
    `;
    const page = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.channelId,
        limit: 50,
        serverId: fixture.serverId,
    });
    expect(page.messages.find((message) => message.id === historical.id)?.body).toMatchObject({
        kind: 'agent-created',
        agent: { agentId, handle: 'tether' },
    });
    const before = await fixture.readAgentRow(agentId);
    expect(before?.creation_message_id).toBeTruthy();

    // Eval cleanup names every chat it opened, Threads included.
    const threads = (await fixture.harness.sql`
        select id from chats
        where server_id = ${fixture.serverId} and parent_chat_id = ${fixture.channelId}
    `) as { id: string }[];
    const chatIds = [fixture.channelId, ...threads.map((thread) => thread.id)];

    await expect(
        fixture.owner.trpc.dev.cleanupEvalChats.mutate({ chatIds, serverId: fixture.serverId })
    ).resolves.toMatchObject({ count: chatIds.length });

    // The Agent outlives the Message that announced it: only the link is cleared.
    const [row] = (await fixture.harness.sql`
        select creation_message_id, server_id from agents where id = ${agentId}
    `) as { creation_message_id: string | null; server_id: string }[];
    expect(row).toEqual({ creation_message_id: null, server_id: fixture.serverId });
});
