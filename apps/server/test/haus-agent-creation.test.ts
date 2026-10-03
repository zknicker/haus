import { expect, test } from 'bun:test';
import type { ServerUpdatedEvent } from '@haus/api';
import { subscribeToServerUpdates } from '../src/haus-api/server-events.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('creation records the Agent and memberships without messages, threads, or inbox work', async () => {
    const runner = await fixture.mintRunner('run_create_happy');
    const before = await conversationCounts();
    const head = await fixture.owner.trpc.chat.eventHead.query({ serverId: fixture.serverId });
    const updates = watchServerUpdates();
    const created = await fixture.postCreate(runner, fixture.createBody({ nonce: 'create-happy' }));

    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
        agent: { displayName: 'Scout', handle: 'scout', retired: false },
        avatar: { status: 'none' },
        computerId: fixture.computerId,
        idempotent: false,
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runtimeId: 'codex',
    });
    expect(created.body).not.toHaveProperty('messageId');
    expect(created.body).not.toHaveProperty('sequence');
    const agentId = created.body.agent?.agentId ?? '';
    expect(await fixture.readAgentRow(agentId)).toMatchObject({
        created_by_agent_id: fixture.orbitAgentId,
        creation_message_id: null,
        desired_model_id: 'gpt-5.6-sol',
    });
    expect(await conversationCounts()).toEqual(before);
    const events = await fixture.owner.trpc.chat.events.query({
        afterCursor: head.cursor,
        serverId: fixture.serverId,
    });
    expect(events.map((event) => event.type)).toEqual(['chat.lifecycle']);
    expect(await updates.next()).toMatchObject({
        agentId,
        scope: 'agent',
        serverId: fixture.serverId,
    });
    updates.stop();
});

test('the creator introduces the returned handle through ordinary send with a session stamp', async () => {
    const runner = await fixture.mintRunner('run_create_intro');
    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Lookout',
            nonce: 'create-intro',
        })
    );
    expect(created.status).toBe(200);
    const handle = created.body.agent?.handle ?? '';
    const sent = await fixture.post('/api/agent/messages/send', runner, {
        content: `Meet @${handle}, our delivery teammate.`,
        nonce: 'ordinary-introduction',
        target: '#all',
    });
    expect(sent.status).toBe(200);
    const [message] = await fixture.harness.sql`
        select content, body_kind, session_generation from chat_messages
        where server_id = ${fixture.serverId} and nonce = 'ordinary-introduction'
    `;
    expect(message).toMatchObject({ body_kind: 'text', session_generation: 1 });
    expect(message.content).toContain(`agent://${created.body.agent?.agentId}`);
});

test('a replayed nonce returns the same Agent and creates nothing new', async () => {
    const runner = await fixture.mintRunner('run_create_replay');
    const body = fixture.createBody({ displayName: 'Echo', nonce: 'create-replay' });

    const first = await fixture.postCreate(runner, body);
    expect(first.status).toBe(200);
    const second = await fixture.postCreate(runner, body);

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
        agent: { agentId: first.body.agent?.agentId },
        idempotent: true,
    });
    expect(await countAgentsNamed('Echo')).toBe(1);
});

test('a reused nonce with different values is refused as a conflict', async () => {
    const runner = await fixture.mintRunner('run_create_conflict');
    const first = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Tally', nonce: 'create-conflict' })
    );
    expect(first.status).toBe(200);

    const conflict = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Tally Two', nonce: 'create-conflict' })
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ code: 'AGENT_CREATE_IDEMPOTENCY_CONFLICT' });
    expect(await countAgentsNamed('Tally Two')).toBe(0);
});

test('creation can use a Thread as its request context without posting there', async () => {
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Create a teammate here.',
        nonce: 'create-thread-anchor',
        serverId: fixture.serverId,
    });
    const reply = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'In this thread.',
        nonce: 'create-thread-reply',
        serverId: fixture.serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadId = reply.message.chatId;
    const runner = await fixture.mintRunner('run_create_thread', fixture.orbitAgentId, threadId);
    const target = `#product:${anchor.message.id.slice('msg_'.length)}`;
    // Arrange the Computer's model-seen proof for the request in this Thread.
    await fixture.harness.sql`
        insert into agent_inbox_cursors (server_id, agent_id, session_generation, chat_id, seen_up_to_sequence)
        values (${fixture.serverId}, ${fixture.orbitAgentId}, 1, ${threadId}, ${reply.message.sequence})
    `;
    const before = await conversationCounts();
    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Threadling',
            nonce: 'create-thread',
            target,
        })
    );
    expect(created.status).toBe(200);
    expect(created.body.chatId).toBe(threadId);
    expect(await conversationCounts()).toEqual(before);
});

test('an archived target refuses the creation', async () => {
    const archived = await fixture.owner.trpc.chat.createChannel.mutate({
        agentIds: [fixture.orbitAgentId],
        name: 'retired-lane',
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.chat.archiveChannel.mutate({
        chatId: archived.id,
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner(
        'run_create_archived',
        fixture.orbitAgentId,
        archived.id
    );

    const refused = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Archived',
            nonce: 'create-archived',
            target: '#retired-lane',
        })
    );

    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'TARGET_READ_ONLY' });
    expect(await countAgentsNamed('Archived')).toBe(0);
});

// Last, because the gate stays closed for this Chat until the Agent reads it again.
test('a Chat that moved since the Agent last read it refuses the creation', async () => {
    const runner = await fixture.mintRunner('run_create_stale');
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'One more thing before you hire.',
        nonce: 'create-stale-human',
        serverId: fixture.serverId,
    });

    const stale = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Stale', nonce: 'create-stale' })
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'CHAT_VIEW_STALE' });
    expect(await countAgentsNamed('Stale')).toBe(0);
});

async function countAgentsNamed(displayName: string) {
    const [row] = (await fixture.harness.sql`
        select count(*)::int as total from agents
        where server_id = ${fixture.serverId} and display_name = ${displayName}
    `) as { total: number }[];
    return row.total;
}

function watchServerUpdates() {
    const controller = new AbortController();
    const iterator = subscribeToServerUpdates(controller.signal)[Symbol.asyncIterator]();
    let outstanding = advance();

    return {
        next: async () => {
            const result = await outstanding;
            outstanding = advance();
            return result.value;
        },
        stop: () => controller.abort(),
    };

    function advance() {
        const pending: Promise<IteratorResult<ServerUpdatedEvent>> = iterator.next();
        pending.catch(() => undefined);
        return pending;
    }
}

async function conversationCounts() {
    const [row] = await fixture.harness.sql`
        select
            (select count(*)::int from chat_messages where server_id = ${fixture.serverId}) as messages,
            (select count(*)::int from chats where server_id = ${fixture.serverId} and kind = 'thread') as threads,
            (select count(*)::int from agent_inbox where server_id = ${fixture.serverId}) as inbox
    `;
    return row;
}
