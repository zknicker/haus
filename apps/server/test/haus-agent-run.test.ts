import { afterAll, beforeAll, expect, test } from 'bun:test';
import { attestAgentEvents } from '../src/agent-api/inbox.ts';
import { readAgentInboxCursor, recordExactMessagesServed } from '../src/agent-delivery/cursors.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { subscribeToAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { readAgentSkillFile } from '../src/server-agents/agent-skill-file.ts';
import { importAgentSkill } from '../src/server-agents/import-agent-skill.ts';
import { recordAgentTurnSummary } from '../src/server-agents/record-agent-turn.ts';
import { McpDeniedError, type McpUpstreamError } from '../src/server-mcp/errors.ts';
import { makeMcpIconResolver } from '../src/server-mcp/icons.ts';
import { McpRuntime } from '../src/server-mcp/runtime.ts';
import { createMcpConnection, disconnectMcpConnection } from '../src/server-mcp/service.ts';
import { listMcpConnections, setMcpGrant } from '../src/server-mcp/state.ts';
import { modelToolName } from '../src/server-mcp/tool-catalog.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { invokeMcp } from './mcp-client.ts';
import { registerServerRuntime, registerTestConnections } from './test-computer-connections.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let serverId: string;
let ownerUserId: string;
let agentId: string;
let dmChatId: string;
const makeConnections = registerTestConnections();
const serverEffectRuntime = registerServerRuntime();
const mcpIconResolver = makeMcpIconResolver(serverEffectRuntime);
const computerId = 'cmp_rrrrrrrrrrrrrrrr';
const credentialHash = 'd'.repeat(64);
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await signIn('user_run_owner');

    const server = await owner.trpc.server.create.mutate({ displayName: 'Run HQ', slug: 'run-hq' });
    serverId = server.id;
    ownerUserId = await readUserId('user_run_owner');
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });

    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash}, ${{ runtimes: [codexRuntime] }}::jsonb, 'healthy')
    `;

    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Sage',
        handle: 'sage',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    dmChatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
    await harness.sql`
        update computers
        set reported_inventory = ${{
            agentSkills: [
                {
                    agentId,
                    skills: [
                        {
                            description: 'Drive a browser.',
                            hash: 'a'.repeat(64),
                            modifiedAt: '2026-07-28T00:00:00.000Z',
                            name: 'agent-browser',
                        },
                    ],
                },
            ],
            runtimes: [codexRuntime],
        }}::jsonb
        where id = ${computerId}
    `;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('chat mention options expose the DM Agent, active humans, visible channels, and skills', async () => {
    const result = await owner.trpc.chat.mentionOptions.query({
        agentIds: [agentId],
        chatId: dmChatId,
        serverId,
    });

    expect(result.options).toEqual([
        expect.objectContaining({
            id: `agent://${agentId}`,
            kind: 'agent',
            label: 'Sage',
        }),
        expect.objectContaining({
            id: expect.stringMatching(/^user:\/\/usr_/u),
            kind: 'user',
            label: 'Ada',
        }),
        expect.objectContaining({
            id: expect.stringMatching(/^chat:\/\/cht_/u),
            insertText: '#all',
            kind: 'chat',
            label: 'all',
            sourceLabel: 'Channels',
        }),
        expect.objectContaining({
            id: expect.stringMatching(/^chat:\/\/cht_/u),
            insertText: '#onboarding-owner',
            kind: 'chat',
            label: 'onboarding-owner',
            sourceLabel: 'Channels',
        }),
        expect.objectContaining({
            id: 'skill://agent-browser',
            insertText: 'agent-browser',
            kind: 'skill',
            label: 'agent-browser',
            metadata: { description: 'Drive a browser.' },
        }),
    ]);
});
test('mints a scoped runner credential and records a durable Agent-authored message', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_send_1' });
    expect(minted.runnerToken).toMatch(/^grtr_/u);
    const lifecycleController = new AbortController();
    const lifecycle = subscribeToAgentLifecycle(lifecycleController.signal)[Symbol.asyncIterator]();
    const sending = lifecycle.next();

    const sent = await agentSend(minted.runnerToken, {
        compositionId: 'cmp_send_1',
        content: 'Hello from the Agent.',
        nonce: 'agent_nonce_1',
        target: 'dm:@ada',
    });
    expect(sent.status).toBe(200);
    expect(sent.body.message).toMatchObject({
        chat_id: dmChatId,
        content: 'Hello from the Agent.',
        sender: { handle: 'sage', type: 'agent' },
    });
    expect(await sending).toMatchObject({
        done: false,
        value: {
            agentId,
            chatId: dmChatId,
            compositionId: 'cmp_send_1',
            phase: 'sending',
            runId: 'run_send_1',
            text: 'Hello from the Agent.',
        },
    });
    expect(await lifecycle.next()).toMatchObject({
        done: false,
        value: { agentId, chatId: dmChatId, phase: 'working', runId: 'run_send_1' },
    });
    lifecycleController.abort();

    const rows = (await harness.sql`
        select author_agent_id, author_user_id, content, run_id, session_generation
        from chat_messages
        where server_id = ${serverId} and chat_id = ${dmChatId} and nonce = 'agent_nonce_1'
    `) as {
        author_agent_id: string;
        author_user_id: string | null;
        content: string;
        run_id: string | null;
        session_generation: number | null;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        author_agent_id: agentId,
        author_user_id: null,
        content: 'Hello from the Agent.',
        run_id: 'run_send_1',
        // The sending session is stamped on the message; the App draws the
        // session mark where this value changes.
        session_generation: 1,
    });

    // A redriven send with the same nonce and content is idempotent, not a dup.
    const again = await agentSend(minted.runnerToken, {
        content: 'Hello from the Agent.',
        nonce: 'agent_nonce_1',
        target: 'dm:@ada',
    });
    expect(again.body.message?.id).toBe(sent.body.message?.id);
    const dupCount = (await harness.sql`
        select count(*)::int as n from chat_messages
        where server_id = ${serverId} and chat_id = ${dmChatId} and nonce = 'agent_nonce_1'
    `) as { n: number }[];
    expect(dupCount[0]?.n).toBe(1);

    // The durable message reads back through the ordinary Server surface with
    // an Agent author, not a human one.
    const page = await owner.trpc.chat.messages.query({ chatId: dmChatId, serverId });
    const agentMessage = page.messages.find((message) => message.nonce === 'agent_nonce_1');
    expect(agentMessage).toMatchObject({
        author: { agentId, kind: 'agent' },
        runId: 'run_send_1',
        sessionGeneration: 1,
    });
});
test('Agent sends remove terminal whitespace while preserving leading and internal whitespace', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_send_whitespace_1' });
    const sent = await agentSend(minted.runnerToken, {
        content: '  Leading indentation\n\n    internal code  \n\nFinal line \t\n',
        nonce: 'agent_send_whitespace_1',
        target: 'dm:@ada',
    });

    expect(sent).toMatchObject({
        body: {
            message: {
                content: '  Leading indentation\n\n    internal code  \n\nFinal line',
            },
            state: 'sent',
        },
        status: 200,
    });
    const rows = (await harness.sql`
        select content from chat_messages
        where server_id = ${serverId} and chat_id = ${dmChatId} and nonce = 'agent_send_whitespace_1'
    `) as { content: string }[];
    expect(rows).toEqual([
        { content: '  Leading indentation\n\n    internal code  \n\nFinal line' },
    ]);
});
test('Agent message references persist as stable Agent and Chat links', async () => {
    const blippy = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Blippy',
        handle: 'blippy',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    const tiny = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Tiny',
        handle: 'tiny',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId, blippy.agent.id, tiny.agent.id],
        name: 'canonical-product',
        serverId,
    });
    // The referenced Channel need not include the author Agent; target access
    // is checked separately by the Agent send resolver.
    const unjoinedChannelId = 'cht_unjoinedreference';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${unjoinedChannelId}, ${serverId}, 'channel', 'unjoined-product')
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${unjoinedChannelId}, ${ownerUserId})
    `;
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_reference_canonicalization' });
    const inputContent =
        'Coordinate @blippy, @tiny, @ada, and unknown @future in #unjoined-product and #canonical-product.';
    const sent = await agentSend(minted.runnerToken, {
        content: inputContent,
        nonce: 'agent_reference_canonicalization_1',
        target: '#canonical-product',
    });
    const expectedContent = `Coordinate [@blippy](agent://${blippy.agent.id}), [@tiny](agent://${tiny.agent.id}), [@ada](user://${ownerUserId}), and unknown @future in [#unjoined-product](chat://${unjoinedChannelId}) and [#canonical-product](chat://${channel.id}).`;

    expect(sent).toMatchObject({
        body: { message: { chat_id: channel.id, content: expectedContent }, state: 'sent' },
        status: 200,
    });
    const rows = (await harness.sql`
        select content from chat_messages
        where server_id = ${serverId} and nonce = 'agent_reference_canonicalization_1'
    `) as { content: string }[];
    expect(rows).toEqual([{ content: expectedContent }]);

    const pending = (await harness.sql`
        select agent_id, content from agent_inbox
        where server_id = ${serverId} and dedupe_key = ${sent.body.message?.id ?? ''}
        order by agent_id
    `) as { agent_id: string; content: string }[];
    expect(pending).toEqual(
        expect.arrayContaining([
            { agent_id: blippy.agent.id, content: expectedContent },
            { agent_id: tiny.agent.id, content: expectedContent },
        ])
    );
    expect(pending).toHaveLength(2);

    await owner.trpc.agent.delete.mutate({
        agentId: blippy.agent.id,
        confirmation: 'Blippy',
        serverId,
    });
    const replacement = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Blippy Replacement',
        handle: 'blippy',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channel.id}, ${replacement.agent.id})
    `;
    await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Future',
        handle: 'future',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    const replay = await agentSend(minted.runnerToken, {
        content: inputContent,
        nonce: 'agent_reference_canonicalization_1',
        target: '#canonical-product',
    });
    expect(replay).toMatchObject({
        body: { message: { content: expectedContent, id: sent.body.message?.id } },
        status: 200,
    });
});
test('Agent reference expansion cannot exceed the durable message limit', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_reference_length' });
    const content = `${'x'.repeat(31_990)} @sage`;
    expect(content.length).toBeLessThanOrEqual(32_000);

    const sent = await agentSend(minted.runnerToken, {
        content,
        nonce: 'agent_reference_length_1',
        target: 'dm:@ada',
    });

    expect(sent).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    const rows = (await harness.sql`
        select id from chat_messages
        where server_id = ${serverId}
          and chat_id = ${dmChatId}
          and nonce = 'agent_reference_length_1'
    `) as { id: string }[];
    expect(rows).toEqual([]);
});
test('an Agent send resolves its target instead of writing into the launch chat', async () => {
    const channelId = 'cht_targetchannel01';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'dispatch')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${ownerUserId})
    `;
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_target_1' });

    const sent = await agentSend(minted.runnerToken, {
        content: 'This belongs in dispatch.',
        nonce: 'agent_target_nonce_1',
        target: '#dispatch',
    });
    expect(sent.status).toBe(200);
    expect(sent.body.message).toMatchObject({ chat_id: channelId });

    const rows = (await harness.sql`
        select chat_id from chat_messages
        where server_id = ${serverId} and nonce = 'agent_target_nonce_1'
    `) as { chat_id: string }[];
    expect(rows).toEqual([{ chat_id: channelId }]);

    const denied = await agentSend(minted.runnerToken, {
        content: 'This must not land.',
        nonce: 'agent_target_nonce_denied',
        target: '#missing',
    });
    expect(denied.status).toBe(404);
    expect(denied.body.code).toBe('INVALID_TARGET');
});
test('an Agent send creates the canonical Thread for a visible fresh anchor', async () => {
    const channelId = 'cht_freshthreadchan';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'fresh-thread')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${ownerUserId})
    `;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Please investigate this in a thread.',
        nonce: 'fresh_thread_anchor',
        serverId,
    });
    const shortAnchor = anchor.message.id.slice(4, 12);
    const minted = await mintRunner({ chatId: channelId, runId: 'run_fresh_thread' });

    const sent = await agentSend(minted.runnerToken, {
        content: 'I am on it.',
        nonce: 'fresh_thread_reply',
        target: `#fresh-thread:${shortAnchor}`,
    });

    expect(sent.status).toBe(200);
    expect(sent.body.message?.chat_id).toBe(`cht_thr_${anchor.message.id.slice(4)}`);
    const threads = (await harness.sql`
        select anchor_message_id, parent_chat_id from chats
        where server_id = ${serverId} and id = ${sent.body.message?.chat_id ?? ''}
    `) as Array<{ anchor_message_id: string; parent_chat_id: string }>;
    expect(threads).toEqual([{ anchor_message_id: anchor.message.id, parent_chat_id: channelId }]);

    await owner.trpc.thread.setFollow.mutate({
        follow: false,
        serverId,
        threadChatId: sent.body.message?.chat_id ?? '',
    });
    const mentioned = await agentSend(minted.runnerToken, {
        content: `[@Operator](user://${ownerUserId}) please rejoin this Thread.`,
        nonce: 'fresh_thread_human_refollow',
        target: `#fresh-thread:${shortAnchor}`,
    });
    expect(mentioned.status).toBe(200);
    const humanFollow = (await harness.sql`
        select followed from thread_follows
        where server_id = ${serverId}
          and thread_chat_id = ${sent.body.message?.chat_id ?? ''}
          and user_id = ${ownerUserId}
    `) as Array<{ followed: boolean }>;
    expect(humanFollow).toEqual([{ followed: true }]);
});
test('an Agent resolves an exact DM thread target and fails closed on wrong peers or anchors', async () => {
    const created = await owner.trpc.task.create.mutate({
        chatId: dmChatId,
        content: 'DM thread target fixture',
        nonce: 'dm_thread_target_task',
        serverId,
    });
    const shortAnchor = created.task.messageId.slice(4, 12);
    const humanReply = await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Distinctive DM child Thread reply.',
        nonce: 'human_dm_thread_reply_1',
        serverId,
        thread: { anchorMessageId: created.task.messageId },
    });
    const [pending] = (await harness.sql`
        select agent_id, chat_id, thread_follow_reactivated
        from agent_inbox
        where server_id = ${serverId} and dedupe_key = ${humanReply.message.id}
    `) as Array<{ agent_id: string; chat_id: string; thread_follow_reactivated: boolean }>;
    expect(pending).toEqual({
        agent_id: agentId,
        chat_id: created.task.threadChatId,
        thread_follow_reactivated: false,
    });

    const minted = await mintRunner({
        chatId: 'cht_targetchannel01',
        runId: 'run_dm_thread_target_1',
    });
    const history = await agentGet(minted.runnerToken, '/api/agent/history', {
        limit: '10',
        target: `dm:@ada:${shortAnchor}`,
    });
    expect(history).toMatchObject({
        body: {
            messages: [
                expect.objectContaining({
                    content: 'Distinctive DM child Thread reply.',
                    id: humanReply.message.id,
                }),
            ],
        },
        status: 200,
    });
    const search = await agentGet(minted.runnerToken, '/api/agent/messages/search', {
        q: 'Distinctive DM child Thread reply',
        sort: 'recent',
    });
    expect(search.body.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: humanReply.message.id })])
    );
    const reacted = await agentPost(minted.runnerToken, '/api/agent/messages/react', {
        emoji: '👀',
        messageId: humanReply.message.id,
    });
    expect(reacted).toMatchObject({
        body: {
            message: {
                id: humanReply.message.id,
                reactions: [{ actors: [{ id: agentId }], emoji: '👀' }],
            },
        },
        status: 200,
    });

    const sent = await agentSend(minted.runnerToken, {
        content: 'This belongs in the DM task thread.',
        nonce: 'agent_dm_thread_target_1',
        target: `dm:@ada:${shortAnchor}`,
    });
    expect(sent).toMatchObject({
        body: {
            shownMessages: [
                expect.objectContaining({
                    chat_id: created.task.threadChatId,
                    id: humanReply.message.id,
                }),
            ],
            state: 'held',
        },
        status: 200,
    });

    for (const target of [
        `dm:@someone-else:${shortAnchor}`,
        'dm:@ada:deadbeef',
        `dm:@ada:${shortAnchor}:extra`,
    ]) {
        const denied = await agentSend(minted.runnerToken, {
            content: 'This must not route.',
            nonce: `denied_${target}`,
            target,
        });
        expect(denied).toMatchObject({
            body: { code: 'INVALID_TARGET' },
            status: 404,
        });
    }

    const target = `dm:@ada:${shortAnchor}`;
    await agentPost(minted.runnerToken, '/api/agent/threads/unfollow', { target });
    const suppressed = await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Ordinary DM Thread reply after unfollow.',
        nonce: 'dm_thread_suppressed_after_unfollow',
        serverId,
        thread: { anchorMessageId: created.task.messageId },
    });
    const [suppressedCount] = (await harness.sql`
        select count(*)::int as count from agent_inbox
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and dedupe_key = ${suppressed.message.id}
    `) as Array<{ count: number }>;
    expect(suppressedCount?.count).toBe(0);

    const restored = await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: '@sage please rejoin this DM Thread.',
        nonce: 'dm_thread_mention_reactivation',
        serverId,
        thread: { anchorMessageId: created.task.messageId },
    });
    const restoredState = (await harness.sql`
        select follow.followed, pending.thread_follow_reactivated
        from agent_thread_follows follow
        join agent_inbox pending
          on pending.server_id = follow.server_id
         and pending.agent_id = follow.agent_id
        where follow.server_id = ${serverId}
          and follow.agent_id = ${agentId}
          and follow.thread_chat_id = ${created.task.threadChatId}
          and pending.dedupe_key = ${restored.message.id}
    `) as Array<{ followed: boolean; thread_follow_reactivated: boolean }>;
    expect(restoredState).toEqual([{ followed: true, thread_follow_reactivated: true }]);
    const restoredHistory = await agentGet(minted.runnerToken, '/api/agent/history', {
        around: restored.message.id,
        limit: '3',
        target,
    });
    expect(restoredHistory.body.thread_follow_reactivated_message_ids).toContain(
        restored.message.id
    );
    await harness.sql`
        update agent_inbox
        set run_id = 'run_dm_thread_target_1', served_at = now(), state = 'served'
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and dedupe_key = ${restored.message.id}
    `;
    const reread = await agentGet(minted.runnerToken, '/api/agent/history', {
        around: restored.message.id,
        limit: '3',
        target,
    });
    expect(reread.body.thread_follow_reactivated_message_ids).not.toContain(restored.message.id);
    const alreadyFollowed = await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: '@sage this mention should not restore twice.',
        nonce: 'dm_thread_already_followed_mention',
        serverId,
        thread: { anchorMessageId: created.task.messageId },
    });
    const alreadyFollowedPending = (await harness.sql`
        select mentioned, thread_follow_reactivated from agent_inbox
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and dedupe_key = ${alreadyFollowed.message.id}
    `) as Array<{ mentioned: boolean; thread_follow_reactivated: boolean }>;
    expect(alreadyFollowedPending).toEqual([{ mentioned: true, thread_follow_reactivated: false }]);
});
test('As Task enters the Agent inbox with canonical unassigned task metadata', async () => {
    const created = await owner.trpc.task.create.mutate({
        chatId: dmChatId,
        content: 'Prepare the weekly launch brief.',
        nonce: 'task_delivery_fixture',
        serverId,
    });

    expect(created.task).toMatchObject({
        assigneeAgentId: null,
        assigneeUserId: null,
        origin: 'composed',
        status: 'todo',
    });
    const pending = (await harness.sql`
        select dedupe_key from agent_inbox
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and dedupe_key = ${created.task.messageId}
    `) as Array<{ dedupe_key: string }>;
    expect(pending).toEqual([{ dedupe_key: created.task.messageId }]);

    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_task_projection' });
    const history = await agentGet(minted.runnerToken, '/api/agent/history', {
        target: 'dm:@ada',
    });
    expect(
        history.body.messages?.find((message) => message.id === created.task.messageId)?.task
    ).toMatchObject({ number: created.task.number, status: 'todo' });
});
test('ordinary Channel delivery preserves per-recipient direct attention', async () => {
    const peer = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Attention Peer',
        handle: 'attention-peer',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId, peer.agent.id],
        name: 'direct-attention-contract',
        serverId,
    });
    const sent = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: '@sage please synthesize this; attention-peer should only observe.',
        nonce: 'ordinary_direct_attention',
        serverId,
    });

    const pending = (await harness.sql`
        select agent_id, content, mentioned
        from agent_inbox
        where server_id = ${serverId} and dedupe_key = ${sent.message.id}
        order by agent_id
    `) as Array<{
        agent_id: string;
        content: string;
        mentioned: boolean;
    }>;
    expect(pending).toEqual(
        expect.arrayContaining([
            {
                agent_id: agentId,
                content: '@sage please synthesize this; attention-peer should only observe.',
                mentioned: true,
            },
            {
                agent_id: peer.agent.id,
                content: '@sage please synthesize this; attention-peer should only observe.',
                mentioned: false,
            },
        ])
    );
    expect(pending).toHaveLength(2);

    const sageRunner = await mintRunner({ chatId: channel.id, runId: 'run_direct_attention_sage' });
    const peerRunner = await mintRunner({
        agentId: peer.agent.id,
        chatId: channel.id,
        runId: 'run_direct_attention_peer',
    });
    const [sageInbox, peerInbox] = await Promise.all([
        agentGet(sageRunner.runnerToken, '/api/agent/inbox', {}),
        agentGet(peerRunner.runnerToken, '/api/agent/inbox', {}),
    ]);
    expect(sageInbox.body.rows?.find((row) => row.chatId === channel.id)?.mentioned).toBe(true);
    expect(peerInbox.body.rows?.find((row) => row.chatId === channel.id)?.mentioned).toBe(false);

    const richMention = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: `[@Sage](agent://${agentId}) please handle the rich-reference follow-up.`,
        nonce: 'rich_direct_attention',
        serverId,
    });
    const richPending = (await harness.sql`
        select agent_id, mentioned
        from agent_inbox
        where server_id = ${serverId} and dedupe_key = ${richMention.message.id}
        order by agent_id
    `) as Array<{ agent_id: string; mentioned: boolean }>;
    expect(richPending).toEqual(
        expect.arrayContaining([
            { agent_id: agentId, mentioned: true },
            { agent_id: peer.agent.id, mentioned: false },
        ])
    );
    expect(richPending).toHaveLength(2);
});
test('mute and explicit unfollow purge ordinary work while preserving exact mentions', async () => {
    const channelId = 'cht_attentioncontract';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'attention-contract')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${ownerUserId})
    `;
    const ordinary = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Routine telemetry.',
        nonce: 'attention_ordinary_before_mute',
        serverId,
    });
    const minted = await mintRunner({ chatId: channelId, runId: 'run_attention_contract' });
    const muted = await agentPost(minted.runnerToken, '/api/agent/channels/mute', {
        target: '#attention-contract',
    });
    expect(muted).toMatchObject({ body: { target: '#attention-contract' }, status: 200 });
    const purged = (await harness.sql`
        select count(*)::int as n from agent_inbox
        where agent_id = ${agentId} and dedupe_key = ${ordinary.message.id}
    `) as Array<{ n: number }>;
    expect(purged[0]?.n).toBe(0);

    const mentioned = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: '@sage please inspect this alert.',
        nonce: 'attention_mention_through_mute',
        serverId,
    });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'More routine telemetry.',
        nonce: 'attention_ordinary_after_mute',
        serverId,
    });
    const mutePending = (await harness.sql`
        select dedupe_key, mentioned from agent_inbox
        where agent_id = ${agentId}
          and chat_id = ${channelId}
          and dedupe_key in (${mentioned.message.id}, (
              select id from chat_messages where nonce = 'attention_ordinary_after_mute'
          ))
        order by dedupe_key
    `) as Array<{ dedupe_key: string; mentioned: boolean }>;
    expect(mutePending).toEqual([{ dedupe_key: mentioned.message.id, mentioned: true }]);

    const task = await owner.trpc.task.create.mutate({
        chatId: channelId,
        content: 'Thread attention fixture.',
        nonce: 'attention_thread_fixture',
        serverId,
    });
    // The Thread exists only once someone replies in it, and an exact mention in
    // that first reply is what makes the Agent follow it.
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: '@sage take this thread.',
        nonce: 'attention_thread_follow_seed',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const threadOrdinary = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Routine child update.',
        nonce: 'attention_thread_ordinary',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const target = `#attention-contract:${task.task.messageId.slice(4, 12)}`;
    const unfollowed = await agentPost(minted.runnerToken, '/api/agent/threads/unfollow', {
        target,
    });
    expect(unfollowed).toMatchObject({
        body: { target, unfollowed: true },
        status: 200,
    });
    const threadPurged = (await harness.sql`
        select count(*)::int as n from agent_inbox
        where agent_id = ${agentId} and dedupe_key = ${threadOrdinary.message.id}
    `) as Array<{ n: number }>;
    expect(threadPurged[0]?.n).toBe(0);

    const threadMention = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: '@sage one direct follow-up.',
        nonce: 'attention_thread_mention',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const explicit = (await harness.sql`
        select followed from agent_thread_follows
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and thread_chat_id = ${task.task.threadChatId}
    `) as Array<{ followed: boolean }>;
    const threadPending = (await harness.sql`
        select mentioned, thread_follow_reactivated from agent_inbox
        where agent_id = ${agentId} and dedupe_key = ${threadMention.message.id}
    `) as Array<{ mentioned: boolean; thread_follow_reactivated: boolean }>;
    expect(explicit).toEqual([{ followed: true }]);
    expect(threadPending).toEqual([{ mentioned: true, thread_follow_reactivated: true }]);

    const ordinaryAfterMention = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Ordinary follow-up after restored attention.',
        nonce: 'attention_thread_after_reactivation',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const ordinaryPending = (await harness.sql`
        select mentioned, thread_follow_reactivated from agent_inbox
        where agent_id = ${agentId} and dedupe_key = ${ordinaryAfterMention.message.id}
    `) as Array<{ mentioned: boolean; thread_follow_reactivated: boolean }>;
    expect(ordinaryPending).toEqual([{ mentioned: false, thread_follow_reactivated: false }]);
});
test('a followed Thread stays active when its parent Channel is muted', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'followed-thread-parent-mute',
        serverId,
    });
    const task = await owner.trpc.task.create.mutate({
        chatId: channel.id,
        content: 'Followed Thread anchor.',
        nonce: 'followed_thread_parent_mute_anchor',
        serverId,
    });
    // The first reply materializes the Thread; the exact mention in it is what
    // makes the Agent follow.
    await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: '@sage take this thread.',
        nonce: 'followed_thread_parent_mute_seed',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const beforeMute = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'Queued before the parent mute.',
        nonce: 'followed_thread_before_parent_mute',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const minted = await mintRunner({
        chatId: channel.id,
        runId: 'run_followed_thread_parent_mute',
    });
    await agentPost(minted.runnerToken, '/api/agent/channels/mute', {
        target: '#followed-thread-parent-mute',
    });
    const afterMute = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'Delivered after the parent mute.',
        nonce: 'followed_thread_after_parent_mute',
        serverId,
        thread: { anchorMessageId: task.task.messageId },
    });

    const pending = (await harness.sql`
        select dedupe_key
        from agent_inbox
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and dedupe_key in (${beforeMute.message.id}, ${afterMute.message.id})
        order by dedupe_key
    `) as Array<{ dedupe_key: string }>;
    expect(pending.map((row) => row.dedupe_key).sort()).toEqual(
        [beforeMute.message.id, afterMute.message.id].sort()
    );

    const target = `#followed-thread-parent-mute:${task.task.messageId.slice(4, 12)}`;
    await agentPost(minted.runnerToken, '/api/agent/threads/unfollow', { target });
    const afterUnfollow = (await harness.sql`
        select count(*)::int as n
        from agent_inbox
        where server_id = ${serverId}
          and agent_id = ${agentId}
          and dedupe_key in (${beforeMute.message.id}, ${afterMute.message.id})
    `) as Array<{ n: number }>;
    expect(afterUnfollow).toEqual([{ n: 0 }]);
});
test('history visibility across a muted gap prevents a duplicate freshness hold', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'muted-history-visibility',
        serverId,
    });
    const minted = await mintRunner({ chatId: channel.id, runId: 'run_muted_history_visibility' });
    await harness.sql`
        insert into agent_delivery (
            agent_id, server_id, active_run_id, active_run_chat_id,
            active_run_computer_id, active_run_runtime_id, active_run_model_id,
            active_run_reasoning_effort,
            accepted_at, dispatched_at
        ) values (
            ${agentId}, ${serverId}, 'run_muted_history_visibility', ${channel.id},
            ${computerId}, 'codex', 'gpt-5.6-sol', 'medium', now(), now()
        )
        on conflict (agent_id) do update set
            active_run_id = excluded.active_run_id,
            active_run_chat_id = excluded.active_run_chat_id,
            active_run_computer_id = excluded.active_run_computer_id,
            active_run_runtime_id = excluded.active_run_runtime_id,
            active_run_model_id = excluded.active_run_model_id,
            active_run_reasoning_effort = excluded.active_run_reasoning_effort,
            accepted_at = excluded.accepted_at,
            dispatched_at = excluded.dispatched_at
    `;
    await agentPost(minted.runnerToken, '/api/agent/channels/mute', {
        target: '#muted-history-visibility',
    });
    const gapOne = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'Suppressed gap one.',
        nonce: 'muted_history_gap_1',
        serverId,
    });
    const gapTwo = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'Suppressed gap two.',
        nonce: 'muted_history_gap_2',
        serverId,
    });
    const mention = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: '@sage inspect the muted gap.',
        nonce: 'muted_history_mention',
        serverId,
    });

    const visible = [gapOne.message, gapTwo.message, mention.message].map((message) => ({
        chatId: message.chatId,
        id: message.id,
        sequence: message.sequence,
    }));
    const attested = await attestAgentEvents(
        connection.db,
        {
            agentId,
            chatId: channel.id,
            computerId,
            runId: 'run_muted_history_visibility',
            runnerId: 'arc_muted_history_visibility',
            serverId,
        },
        visible
    );
    expect(attested).toEqual({ accepted: visible.map((message) => message.id) });

    const sent = await agentSend(minted.runnerToken, {
        content: 'I reviewed the complete muted gap.',
        nonce: 'muted_history_reply',
        target: '#muted-history-visibility',
    });
    expect(sent).toMatchObject({ body: { state: 'sent' }, status: 200 });
    expect(
        await readAgentInboxCursor(connection.db, {
            agentId,
            chatId: channel.id,
            serverId,
        })
    ).toMatchObject({ seen: mention.message.sequence });
    await harness.sql`
        update agent_delivery
        set active_run_id = null,
            active_run_chat_id = null,
            active_run_computer_id = null,
            active_run_runtime_id = null,
            active_run_model_id = null,
            active_run_reasoning_effort = null,
            accepted_at = null,
            dispatched_at = null
        where agent_id = ${agentId}
    `;
});
test('an ambiguous Channel Thread prefix fails closed', async () => {
    const channelId = 'cht_ambiguous_threads';
    await harness.sql`
        insert into chats (id, server_id, kind, name, last_message_sequence)
        values (${channelId}, ${serverId}, 'channel', 'ambiguous-threads', 2)
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into chat_messages
            (id, server_id, chat_id, sequence, nonce, author_user_id, content)
        values
            ('msg_deadbeef_anchor_one', ${serverId}, ${channelId}, 1, 'ambiguous_anchor_one', ${ownerUserId}, 'First anchor'),
            ('msg_deadbeef_anchor_two', ${serverId}, ${channelId}, 2, 'ambiguous_anchor_two', ${ownerUserId}, 'Second anchor')
    `;
    await harness.sql`
        insert into chats
            (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
        values
            ('cht_ambiguous_thread_one', ${serverId}, 'thread', ${channelId}, 'channel', 'msg_deadbeef_anchor_one'),
            ('cht_ambiguous_thread_two', ${serverId}, 'thread', ${channelId}, 'channel', 'msg_deadbeef_anchor_two')
    `;
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_ambiguous_thread_1' });

    const denied = await agentSend(minted.runnerToken, {
        content: 'This must not pick an arbitrary Thread.',
        nonce: 'agent_ambiguous_thread_1',
        target: '#ambiguous-threads:deadbeef',
    });
    expect(denied).toMatchObject({
        body: { code: 'INVALID_TARGET' },
        status: 404,
    });
});

test('a reminder preserves its canonical Channel Thread target', async () => {
    const channelId = 'cht_reminder_threads';
    const threadId = 'cht_reminder_thread';
    const anchorMessageId = 'msg_cafebabe_anchor';
    const reminderMessageId = 'msg_reminder_thread_message';
    await harness.sql`
        insert into chats (id, server_id, kind, name, last_message_sequence)
        values (${channelId}, ${serverId}, 'channel', 'reminder-threads', 1)
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into chat_messages
            (id, server_id, chat_id, sequence, nonce, author_user_id, content)
        values
            (${anchorMessageId}, ${serverId}, ${channelId}, 1, 'reminder_thread_anchor', ${ownerUserId}, 'Reminder Thread anchor')
    `;
    await harness.sql`
        insert into chats
            (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id, last_message_sequence)
        values
            (${threadId}, ${serverId}, 'thread', ${channelId}, 'channel', ${anchorMessageId}, 1)
    `;
    await harness.sql`
        insert into chat_messages
            (id, server_id, chat_id, sequence, nonce, author_agent_id, content)
        values
            (${reminderMessageId}, ${serverId}, ${threadId}, 1, 'reminder_thread_message', ${agentId}, 'Remember this Thread reply')
    `;
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_thread_reminder_1' });

    const fireAt = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await agentPost(minted.runnerToken, '/api/agent/reminders/schedule', {
        commandId: 'thread-reminder-schedule',
        fireAt,
        messageId: reminderMessageId,
        title: 'Follow up inside the Channel Thread',
    });
    expect(scheduled).toMatchObject({
        body: {
            reminder: {
                anchorTarget: '#reminder-threads:cafebabe',
                title: 'Follow up inside the Channel Thread',
            },
        },
        status: 200,
    });
    const listed = await agentGet(minted.runnerToken, '/api/agent/reminders', {
        status: 'scheduled',
    });
    expect(listed.body.reminders).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                anchorTarget: '#reminder-threads:cafebabe',
                id: scheduled.body.reminder?.id,
            }),
        ])
    );
});

test('a channel send holds a durable draft until the Agent catches up', async () => {
    const channelId = 'cht_targetchannel01';
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_hold_1' });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'New peer context before the reply.',
        nonce: 'human_hold_1',
        serverId,
    });

    const held = await agentSend(minted.runnerToken, {
        content: '  This exact reply\n\n    keeps internal formatting.  \n\nHeld ending \t\n',
        nonce: 'agent_hold_nonce_1',
        target: '#dispatch',
    });
    expect(held.status).toBe(200);
    expect(held.body).toMatchObject({
        continueAnywaySuggested: false,
        newMessageCount: 1,
        reholdCount: 1,
        state: 'held',
    });
    expect(held.body.shownMessages?.[0]).toMatchObject({
        content: 'New peer context before the reply.',
    });
    const drafts = (await harness.sql`
        select content from agent_message_drafts
        where server_id = ${serverId} and agent_id = ${agentId} and chat_id = ${channelId}
    `) as { content: string }[];
    expect(drafts).toEqual([
        { content: '  This exact reply\n\n    keeps internal formatting.  \n\nHeld ending' },
    ]);

    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'One more update before release.',
        nonce: 'human_hold_2',
        serverId,
    });
    const reheld = await agentSend(minted.runnerToken, {
        nonce: 'agent_hold_nonce_2',
        sendDraft: true,
        target: '#dispatch',
    });
    expect(reheld.body).toMatchObject({
        continueAnywaySuggested: true,
        reholdCount: 2,
        state: 'held',
    });

    const released = await agentSend(minted.runnerToken, {
        continueAnyway: true,
        nonce: 'agent_hold_nonce_3',
        sendDraft: true,
        target: '#dispatch',
    });
    expect(released.body).toMatchObject({
        message: {
            content: '  This exact reply\n\n    keeps internal formatting.  \n\nHeld ending',
        },
        state: 'sent',
    });
});

test('send hold counts exact Agent handle mentions, never opaque ids or handle prefixes', async () => {
    const channelId = 'cht_targetchannel01';
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_hold_mentions_1' });
    for (const [index, content] of [
        `Opaque ids are not mentions: @${agentId}`,
        'Handle prefixes are not mentions: @sage-ish',
        'Exact handles are mentions: @Sage, please inspect this.',
    ].entries()) {
        await owner.trpc.chat.send.mutate({
            chatId: channelId,
            content,
            nonce: `human_hold_mention_${index}`,
            serverId,
        });
    }

    const held = await agentSend(minted.runnerToken, {
        content: 'This response should pause for context.',
        nonce: 'agent_hold_mentions_1',
        target: '#dispatch',
    });
    expect(held).toMatchObject({
        body: { formalMentionCount: 1, state: 'held' },
        status: 200,
    });
});

test('the ported Agent CLI read surface can read, search, and resolve visible messages', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_read_1' });
    const sent = await agentSend(minted.runnerToken, {
        content: 'Distinctive telescope release note.',
        nonce: 'agent_read_nonce_1',
        target: 'dm:@ada',
    });
    expect(sent.status).toBe(200);
    const messageId = sent.body.message?.id;
    expect(messageId).toBeTruthy();

    const history = await agentGet(minted.runnerToken, '/api/agent/history', {
        limit: '10',
        target: 'dm:@ada',
    });
    expect(history.status).toBe(200);
    expect(history.body.messages).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                chat_id: dmChatId,
                content: 'Distinctive telescope release note.',
            }),
        ])
    );

    const search = await agentGet(minted.runnerToken, '/api/agent/messages/search', {
        q: 'telescope',
        sort: 'recent',
    });
    expect(search.status).toBe(200);
    expect(search.body.messages).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: messageId, target: 'dm:@ada' })])
    );

    const resolved = await agentGet(
        minted.runnerToken,
        `/api/agent/messages/${messageId?.slice(4, 12)}`,
        {}
    );
    expect(resolved.status).toBe(200);
    expect(resolved.body.message).toMatchObject({ id: messageId });
});

test('an Agent uploads, sends, reads, and downloads its own attachment', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_attachment_1' });
    const upload = await agentPost(minted.runnerToken, '/api/agent/attachments/upload', {
        dataBase64: Buffer.from('agent attachment bytes').toString('base64'),
        filename: 'notes.txt',
        mediaType: 'text/plain',
    });
    expect(upload.status).toBe(200);
    expect(upload.body.attachment).toMatchObject({
        byteSize: 22,
        filename: 'notes.txt',
        mediaType: 'text/plain',
    });
    const attachmentId = String(upload.body.attachment?.id);

    const sent = await agentSend(minted.runnerToken, {
        attachmentIds: [attachmentId],
        content: 'The notes are attached.',
        nonce: 'agent_attachment_nonce_1',
        target: 'dm:@ada',
    });
    expect(sent.status).toBe(200);
    expect(sent.body.message?.attachments).toEqual([
        expect.objectContaining({ filename: 'notes.txt', id: attachmentId }),
    ]);

    const history = await agentGet(minted.runnerToken, '/api/agent/history', {
        limit: '10',
        target: 'dm:@ada',
    });
    expect(
        history.body.messages?.find((message) => message.id === sent.body.message?.id)?.attachments
    ).toEqual([expect.objectContaining({ id: attachmentId })]);

    const viewed = await agentGet(minted.runnerToken, `/api/agent/attachments/${attachmentId}`, {});
    expect(viewed.body.attachment).toMatchObject({
        dataBase64: Buffer.from('agent attachment bytes').toString('base64'),
        id: attachmentId,
    });
});

test('an Agent adds and removes its own canonical message reaction', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_reaction_1' });
    const sent = await agentSend(minted.runnerToken, {
        content: 'React to this canonical message.',
        nonce: 'agent_reaction_nonce_1',
        target: 'dm:@ada',
    });
    const messageId = String(sent.body.message?.id);

    const added = await agentPost(minted.runnerToken, '/api/agent/messages/react', {
        emoji: '👍',
        messageId: messageId.slice(4, 12),
    });
    expect(added.status).toBe(200);
    expect(added.body.message?.reactions).toEqual([
        { actors: [{ handle: 'sage', id: agentId }], emoji: '👍' },
    ]);

    const removed = await agentPost(minted.runnerToken, '/api/agent/messages/react', {
        emoji: '👍',
        messageId,
        remove: true,
    });
    expect(removed.status).toBe(200);
    expect(removed.body.message?.reactions).toEqual([]);
});

test('the ported Agent directory can inspect and change channel membership', async () => {
    const channelId = 'cht_directorychannel';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'research')
    `;
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_directory_1' });

    const before = await agentGet(minted.runnerToken, '/api/agent/channels/info', {
        target: '#research',
    });
    expect(before.body).toMatchObject({ handle: '#research', joined: false });

    const joined = await agentPost(minted.runnerToken, '/api/agent/channels/join', {
        target: '#research',
    });
    expect(joined).toMatchObject({
        body: { joined: true, target: '#research' },
        status: 200,
    });

    const directory = await agentGet(minted.runnerToken, '/api/agent/server', {
        channels: 'true',
        joined: 'true',
    });
    expect(directory.body.channels).toEqual(
        expect.arrayContaining([expect.objectContaining({ handle: '#research', joined: true })])
    );
    const members = await agentGet(minted.runnerToken, '/api/agent/channels/members', {
        target: '#research',
    });
    expect(members.body.members).toEqual(
        expect.arrayContaining([expect.objectContaining({ handle: 'sage', role: 'agent' })])
    );

    const left = await agentPost(minted.runnerToken, '/api/agent/channels/leave', {
        target: '#research',
    });
    expect(left).toMatchObject({ body: { left: true, target: '#research' }, status: 200 });
});

test('the ported Agent task flow creates, claims, updates, and releases its own work', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_tasks_1' });
    const created = await agentPost(minted.runnerToken, '/api/agent/tasks/create', {
        nonce: 'agent_tasks_create_1',
        target: '#dispatch',
        titles: ['Audit the delivery boundary'],
    });
    expect(created).toMatchObject({
        body: {
            tasks: [
                {
                    assignee: null,
                    number: 1,
                    status: 'todo',
                    target: '#dispatch',
                    version: 1,
                },
            ],
        },
        status: 200,
    });

    const claimed = await agentPost(minted.runnerToken, '/api/agent/tasks/claim', {
        numbers: [1],
        target: '#dispatch',
    });
    expect(claimed.body.claimed[0]).toMatchObject({
        assignee: { handle: 'sage', id: agentId },
        status: 'in_progress',
        version: 2,
    });
    const repeatedClaim = await agentPost(minted.runnerToken, '/api/agent/tasks/claim', {
        numbers: [1],
        target: '#dispatch',
    });
    expect(repeatedClaim.body.claimed[0]).toMatchObject({
        assignee: { handle: 'sage', id: agentId },
        status: 'in_progress',
        version: 2,
    });
    const updated = await agentPost(minted.runnerToken, '/api/agent/tasks/update', {
        number: 1,
        status: 'in_review',
        target: '#dispatch',
    });
    expect(updated.body.task).toMatchObject({
        assignee: { handle: 'sage', id: agentId },
        status: 'in_review',
        version: 3,
    });
    const unclaimed = await agentPost(minted.runnerToken, '/api/agent/tasks/unclaim', {
        number: 1,
        target: '#dispatch',
    });
    expect(unclaimed.body.task).toMatchObject({ assignee: null, status: 'in_review', version: 4 });

    const [row] = (await harness.sql`
        select created_by_agent_id, created_by_user_id, assignee_agent_id
        from message_tasks
        where server_id = ${serverId} and chat_id = 'cht_targetchannel01' and number = 1
    `) as Array<{
        assignee_agent_id: string | null;
        created_by_agent_id: string | null;
        created_by_user_id: string | null;
    }>;
    expect(row).toEqual({
        assignee_agent_id: null,
        created_by_agent_id: agentId,
        created_by_user_id: null,
    });
    const events = (await harness.sql`
        select ce.event_type
        from chat_events ce
        inner join chat_messages cm
            on cm.server_id = ce.server_id and cm.id = ce.message_id
        where ce.server_id = ${serverId}
          and cm.content = 'Audit the delivery boundary'
        order by ce.cursor
    `) as Array<{ event_type: string }>;
    expect(events.map((event) => event.event_type)).toEqual([
        'message.created',
        'task.created',
        'task.updated',
        'task.updated',
        'task.updated',
    ]);
    const regular = await owner.trpc.chat.send.mutate({
        chatId: 'cht_targetchannel01',
        content: 'Turn this ordinary message into claimed work.',
        nonce: 'human_task_conversion_1',
        serverId,
    });
    const existingThreadReply = await owner.trpc.chat.send.mutate({
        chatId: 'cht_targetchannel01',
        content: 'Existing thread context must survive task conversion.',
        nonce: 'human_task_conversion_thread_1',
        serverId,
        thread: { anchorMessageId: regular.message.id },
    });
    await recordExactMessagesServed(connection.db, {
        agentId,
        messages: [
            { chatId: existingThreadReply.message.chatId, id: existingThreadReply.message.id },
        ],
        runId: 'run_tasks_1',
        serverId,
    });
    const converted = await agentPost(minted.runnerToken, '/api/agent/tasks/claim', {
        messageId: regular.message.id.slice(4, 12),
        target: '#dispatch',
    });
    expect(converted).toMatchObject({
        body: {
            claimed: [
                {
                    assignee: { handle: 'sage', id: agentId },
                    number: 2,
                    status: 'in_progress',
                    target: '#dispatch',
                },
            ],
        },
        status: 200,
    });
    expect(existingThreadReply.threadChatId).toBe(
        `cht_thr_${regular.message.id.slice('msg_'.length)}`
    );
    const preservedThread = await owner.trpc.chat.messages.query({
        chatId: existingThreadReply.threadChatId as string,
        serverId,
    });
    expect(preservedThread.messages).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                content: 'Existing thread context must survive task conversion.',
                id: existingThreadReply.message.id,
            }),
        ])
    );
    const [convertedRow] = (await harness.sql`
        select origin, message_id, assignee_agent_id
        from message_tasks
        where server_id = ${serverId} and chat_id = 'cht_targetchannel01' and number = 2
    `) as Array<{ assignee_agent_id: string | null; message_id: string; origin: string }>;
    expect(convertedRow).toEqual({
        assignee_agent_id: agentId,
        message_id: regular.message.id,
        origin: 'claimed',
    });
    const convertedEvents = (await harness.sql`
        select event_type
        from chat_events
        where server_id = ${serverId} and message_id = ${regular.message.id}
        order by cursor
    `) as Array<{ event_type: string }>;
    expect(convertedEvents.map((event) => event.event_type)).toEqual([
        'message.created',
        'task.created',
    ]);
});

test('task ownership is one lock across human and Agent actors', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_task_actor_lock' });
    const humanOwned = await owner.trpc.task.create.mutate({
        assigneeUserId: ownerUserId,
        chatId: 'cht_targetchannel01',
        content: 'Human-owned task must stay human-owned.',
        nonce: 'human_owned_task_actor_lock',
        serverId,
    });

    const agentClaim = await agentPost(minted.runnerToken, '/api/agent/tasks/claim', {
        numbers: [humanOwned.task.number],
        target: '#dispatch',
    });
    expect(agentClaim).toMatchObject({
        body: { code: 'TASK_CONFLICT' },
        status: 409,
    });

    const agentOwned = await agentPost(minted.runnerToken, '/api/agent/tasks/create', {
        assignee: '@sage',
        nonce: 'agent_owned_task_actor_lock',
        target: '#dispatch',
        titles: ['Agent-owned task must stay Agent-owned.'],
    });
    const agentTask = agentOwned.body.tasks[0] as {
        message: { id: string };
        number: number;
        version: number;
    };
    await expect(
        owner.trpc.task.claim.mutate({
            expectedVersion: agentTask.version,
            messageId: agentTask.message.id,
            serverId,
        })
    ).rejects.toThrow(/already owned/i);
});

test('concurrent Agent claims choose one owner and the losing Agent cannot proceed', async () => {
    const channelId = 'cht_concurrentclaim';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'concurrent-claim')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${ownerUserId})
    `;
    const peer = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Rival',
        handle: 'rival',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${peer.agent.id})
    `;
    const created = await owner.trpc.task.create.mutate({
        chatId: channelId,
        content: 'Exactly one Agent may own this work.',
        nonce: 'concurrent_agent_claim',
        serverId,
    });
    const [coveRunner, rivalRunner] = await Promise.all([
        mintRunner({ chatId: channelId, runId: 'run_concurrent_cove' }),
        mintRunner({ agentId: peer.agent.id, chatId: channelId, runId: 'run_concurrent_rival' }),
    ]);
    const claimBody = {
        numbers: [created.task.number],
        target: '#concurrent-claim',
    };
    const claims = await Promise.all([
        agentPost(coveRunner.runnerToken, '/api/agent/tasks/claim', claimBody),
        agentPost(rivalRunner.runnerToken, '/api/agent/tasks/claim', claimBody),
    ]);

    expect(claims.filter((claim) => claim.status === 200)).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === 409)).toHaveLength(1);
    const loserIndex = claims.findIndex((claim) => claim.status === 409);
    const loserToken = [coveRunner.runnerToken, rivalRunner.runnerToken][loserIndex];
    expect(loserToken).toBeTruthy();

    const update = await agentPost(loserToken ?? '', '/api/agent/tasks/update', {
        number: created.task.number,
        status: 'in_review',
        target: '#concurrent-claim',
    });
    const unclaim = await agentPost(loserToken ?? '', '/api/agent/tasks/unclaim', {
        number: created.task.number,
        target: '#concurrent-claim',
    });
    expect(update).toMatchObject({
        body: { code: 'TASK_CONFLICT' },
        status: 409,
    });
    expect(unclaim).toMatchObject({
        body: { code: 'TASK_CONFLICT' },
        status: 409,
    });

    const [stored] = (await harness.sql`
        select assignee_agent_id, status
        from message_tasks
        where server_id = ${serverId} and message_id = ${created.task.messageId}
    `) as Array<{ assignee_agent_id: string | null; status: string }>;
    const winnerAgentId = claims[0]?.status === 200 ? agentId : peer.agent.id;
    expect(stored).toEqual({
        assignee_agent_id: winnerAgentId,
        status: 'in_progress',
    });
});

test('runner task access fails closed after the Agent loses its parent Channel', async () => {
    const channelId = 'cht_revokedtaskaccess';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'revoked-task-access')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${ownerUserId})
    `;
    const runner = await mintRunner({ chatId: channelId, runId: 'run_revoked_task_access' });
    const claimed = await agentPost(runner.runnerToken, '/api/agent/tasks/create', {
        assignee: '@sage',
        nonce: 'revoked_task_access_claimed',
        target: '#revoked-task-access',
        titles: ['Claimed work becomes inaccessible.'],
    });
    const unassigned = await agentPost(runner.runnerToken, '/api/agent/tasks/create', {
        nonce: 'revoked_task_access_unassigned',
        target: '#revoked-task-access',
        titles: ['Unassigned work becomes inaccessible.'],
    });
    const claimedTask = claimed.body.tasks?.[0];
    const unassignedTask = unassigned.body.tasks?.[0];
    expect(claimedTask).toBeTruthy();
    expect(unassignedTask).toBeTruthy();

    await harness.sql`
        delete from channel_agent_participants
        where server_id = ${serverId} and chat_id = ${channelId} and agent_id = ${agentId}
    `;

    const targetedList = await agentGet(runner.runnerToken, '/api/agent/tasks', {
        target: '#revoked-task-access',
    });
    expect(targetedList).toMatchObject({
        body: { code: 'INVALID_TARGET' },
        status: 404,
    });
    const readableList = await agentGet(runner.runnerToken, '/api/agent/tasks', {});
    expect(readableList.status).toBe(200);
    expect(readableList.body.tasks).not.toEqual(
        expect.arrayContaining([
            expect.objectContaining({ message: { id: claimedTask?.message.id } }),
            expect.objectContaining({ message: { id: unassignedTask?.message.id } }),
        ])
    );

    for (const attempt of [
        agentPost(runner.runnerToken, '/api/agent/tasks/claim', {
            numbers: [unassignedTask?.number],
            target: '#revoked-task-access',
        }),
        agentPost(runner.runnerToken, '/api/agent/tasks/update', {
            number: claimedTask?.number,
            status: 'in_review',
            target: '#revoked-task-access',
        }),
        agentPost(runner.runnerToken, '/api/agent/tasks/unclaim', {
            number: claimedTask?.number,
            target: '#revoked-task-access',
        }),
    ]) {
        await expect(attempt).resolves.toMatchObject({
            body: { code: 'INVALID_TARGET' },
            status: 404,
        });
    }

    const rows = (await harness.sql`
        select message_id, assignee_agent_id, status
        from message_tasks
        where server_id = ${serverId} and chat_id = ${channelId}
        order by number
    `) as Array<{ assignee_agent_id: string | null; message_id: string; status: string }>;
    expect(rows).toEqual([
        {
            assignee_agent_id: agentId,
            message_id: claimedTask?.message.id,
            status: 'in_progress',
        },
        {
            assignee_agent_id: null,
            message_id: unassignedTask?.message.id,
            status: 'todo',
        },
    ]);
});

test('task status updates wait for newer exact-thread context', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_task_freshness' });
    const created = await agentPost(minted.runnerToken, '/api/agent/tasks/create', {
        assignee: '@sage',
        nonce: 'agent_task_freshness',
        target: 'dm:@ada',
        titles: ['Incorporate every late correction.'],
    });
    const task = created.body.tasks[0] as {
        message: { id: string };
        number: number;
        version: number;
    };
    const correction = await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Late correction: include the hostname.',
        nonce: 'task_freshness_correction',
        serverId,
        thread: { anchorMessageId: task.message.id },
    });

    const held = await agentPost(minted.runnerToken, '/api/agent/tasks/update', {
        number: task.number,
        status: 'in_review',
        target: 'dm:@ada',
    });
    expect(held).toMatchObject({
        body: {
            code: 'TASK_CONFLICT',
            message: expect.stringMatching(/haus message check/u),
        },
        status: 409,
    });

    await recordExactMessagesServed(connection.db, {
        agentId,
        messages: [{ chatId: correction.message.chatId, id: correction.message.id }],
        runId: 'run_task_freshness',
        serverId,
    });
    const updated = await agentPost(minted.runnerToken, '/api/agent/tasks/update', {
        number: task.number,
        status: 'in_review',
        target: 'dm:@ada',
    });
    expect(updated).toMatchObject({
        body: { task: { status: 'in_review' } },
        status: 200,
    });
});

test('Agent task creation is replay-safe and directly wakes an assigned peer', async () => {
    const channelId = 'cht_taskdelegation01';
    await harness.sql`
        insert into chats (id, server_id, kind, name)
        values (${channelId}, ${serverId}, 'channel', 'task-delegation')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${ownerUserId})
    `;
    const peer = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Scout',
        handle: 'scout',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${peer.agent.id})
    `;
    await harness.sql`
        insert into agent_channel_mutes (server_id, agent_id, chat_id)
        values (${serverId}, ${peer.agent.id}, ${channelId})
    `;
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_task_peer_assignment' });
    const body = {
        assignee: '@scout',
        nonce: 'agent_task_peer_assignment',
        target: '#task-delegation',
        titles: ['Scout the release notes.'],
    };
    const created = await agentPost(minted.runnerToken, '/api/agent/tasks/create', body);
    expect(created).toMatchObject({
        body: {
            tasks: [
                {
                    assignee: {
                        handle: 'scout',
                        id: peer.agent.id,
                    },
                    status: 'todo',
                },
            ],
        },
        status: 200,
    });
    const messageId = String(created.body.tasks[0]?.message.id);
    const appMessages = await owner.trpc.chat.messages.query({ chatId: channelId, serverId });
    expect(appMessages.messages).toHaveLength(1);
    expect(appMessages.messages[0]?.id).toBe(messageId);
    await expect(
        owner.trpc.chat.search.query({ chatId: channelId, query: 'Assigned scout', serverId })
    ).resolves.toEqual([]);
    const channel = (await owner.trpc.chat.list.query({ serverId })).find(
        (candidate) => candidate.id === channelId
    );
    expect(channel?.unreadCount).toBe(1);
    const replayed = await agentPost(minted.runnerToken, '/api/agent/tasks/create', body);
    expect(replayed.body.tasks[0]?.message.id).toBe(messageId);
    const conflictingReplay = await agentPost(minted.runnerToken, '/api/agent/tasks/create', {
        ...body,
        assignee: undefined,
    });
    expect(conflictingReplay).toMatchObject({
        body: { code: 'TASK_CONFLICT' },
        status: 409,
    });
    const rows = (await harness.sql`
        select count(*)::int as count
        from chat_messages
        where server_id = ${serverId}
          and chat_id = ${channelId}
          and nonce = 'agent_task_peer_assignment:0'
    `) as Array<{ count: number }>;
    expect(rows).toEqual([{ count: 1 }]);
    const pending = (await harness.sql`
        select agent_id, dedupe_key, mentioned, source
        from agent_inbox
        where server_id = ${serverId}
          and chat_id = ${channelId}
        order by created_at, id
    `) as Array<{ agent_id: string; dedupe_key: string; mentioned: boolean; source: string }>;
    // The handoff writes no Chat message: everything in `chat_messages` is
    // human-readable, so the assignment rides a typed inbox item instead.
    const authorless = (await harness.sql`
        select id from chat_messages
        where server_id = ${serverId} and chat_id = ${channelId}
          and author_user_id is null and author_agent_id is null
    `) as Array<{ id: string }>;
    expect(authorless).toEqual([]);
    expect(pending).toEqual(
        expect.arrayContaining([
            {
                agent_id: peer.agent.id,
                dedupe_key: messageId,
                mentioned: false,
                source: 'agent:sage',
            },
            {
                agent_id: peer.agent.id,
                dedupe_key: `task-assign:${messageId}:1`,
                mentioned: true,
                source: 'task_assignment',
            },
        ])
    );
    expect(pending).toHaveLength(2);
    const peerRunner = await mintRunner({
        agentId: peer.agent.id,
        chatId: channelId,
        runId: 'run_task_peer_assignment_events',
    });
    await harness.sql`
        update agent_delivery
        set active_run_id = 'run_task_peer_assignment_events',
            active_run_chat_id = ${channelId},
            active_run_computer_id = ${computerId},
            active_run_runtime_id = 'codex',
            active_run_model_id = 'gpt-5.6-sol',
            active_run_reasoning_effort = 'medium',
            accepted_at = now(),
            dispatched_at = now()
        where agent_id = ${peer.agent.id}
    `;
    const eventsResponse = await fetch(new URL('/api/agent/events', harness.url), {
        headers: { authorization: `Bearer ${peerRunner.runnerToken}` },
    });
    expect(eventsResponse.status).toBe(200);
    const events = (await eventsResponse.json()) as {
        automations: Array<{
            content: string;
            id: string;
            senderHandle: string;
            senderType: string;
            target: string;
        }>;
        messages: Array<{
            message: {
                author: { kind: string };
                content: string;
                id: string;
                role: string;
                sender: { handle: string | null; type: string };
            };
            target: string;
        }>;
        more: boolean;
    };
    expect(events.more).toBe(false);
    expect(
        events.messages.map(({ message }) => ({
            authorKind: message.author.kind,
            content: message.content,
            id: message.id,
            role: message.role,
            senderHandle: message.sender.handle,
            senderType: message.sender.type,
        }))
    ).toEqual([
        {
            authorKind: 'agent',
            content: 'Scout the release notes.',
            id: messageId,
            role: 'assistant',
            senderHandle: 'sage',
            senderType: 'agent',
        },
    ]);
    expect(events.automations).toEqual([
        {
            content:
                '[Haus task assignment task=#1 target=#task-delegation assignedBy=@sage] Scout the release notes.',
            createdAt: expect.any(String),
            id: `task-assign:${messageId}:1`,
            senderHandle: 'haus',
            senderType: 'system',
            target: '#task-delegation',
        },
    ]);
    // Reservation had no Thread to point at; the first reply materializes it and
    // attaches the assignee's follow.
    const threadChatId = `cht_thr_${messageId.slice(4)}`;
    const reservedThread = (await harness.sql`
        select id from chats where server_id = ${serverId} and id = ${threadChatId}
    `) as Array<{ id: string }>;
    expect(reservedThread).toEqual([]);
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'First reply on the assigned task.',
        nonce: 'agent_task_peer_assignment_reply',
        serverId,
        thread: { anchorMessageId: messageId },
    });
    const follows = (await harness.sql`
        select followed
        from agent_thread_follows
        where server_id = ${serverId}
          and agent_id = ${peer.agent.id}
          and thread_chat_id = ${threadChatId}
    `) as Array<{ followed: boolean }>;
    expect(follows).toEqual([{ followed: true }]);
    await owner.trpc.agent.delete.mutate({
        agentId: peer.agent.id,
        confirmation: peer.agent.displayName,
        serverId,
    });
});

test('an Agent owns its profile description and that description rides its messages', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_profile_1' });
    const updated = await agentPost(minted.runnerToken, '/api/agent/profile/update', {
        description: 'Resident systems investigator',
    });
    expect(updated).toMatchObject({
        body: {
            profile: {
                description: 'Resident systems investigator',
                handle: 'sage',
                isSelf: true,
            },
        },
        status: 200,
    });

    const profile = await agentGet(minted.runnerToken, '/api/agent/profile', {});
    expect(profile.body.profile).toMatchObject({
        description: 'Resident systems investigator',
        handle: 'sage',
        isSelf: true,
    });

    const sent = await agentSend(minted.runnerToken, {
        content: 'Profile descriptions should travel.',
        nonce: 'agent_profile_nonce_1',
        target: 'dm:@ada',
    });
    expect(sent.body.message?.sender).toEqual({
        description: 'Resident systems investigator',
        handle: 'sage',
        type: 'agent',
    });
});

test('the ported Agent reminder flow schedules against a DM message and can manage it', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_reminder_1' });
    const anchor = await agentSend(minted.runnerToken, {
        content: 'Remember this exact DM.',
        nonce: 'agent_reminder_anchor_1',
        target: 'dm:@ada',
    });
    expect(anchor.status).toBe(200);

    const fireAt = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await agentPost(minted.runnerToken, '/api/agent/reminders/schedule', {
        commandId: 'dm-reminder-schedule',
        fireAt,
        messageId: anchor.body.message?.id,
        title: 'Follow up on the DM',
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.reminder).toMatchObject({
        anchorTarget: 'dm:@ada',
        script: false,
        status: 'scheduled',
        title: 'Follow up on the DM',
    });
    const reminderId = scheduled.body.reminder?.id as string;
    const scheduledAgain = await agentPost(minted.runnerToken, '/api/agent/reminders/schedule', {
        commandId: 'dm-reminder-schedule',
        fireAt,
        messageId: anchor.body.message?.id,
        title: 'Follow up on the DM',
    });
    expect(scheduledAgain.body.reminder).toEqual(scheduled.body.reminder);

    const listed = await agentGet(minted.runnerToken, '/api/agent/reminders', {
        status: 'scheduled',
    });
    expect(listed.status).toBe(200);
    expect(listed.body.reminders).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: reminderId })])
    );

    const snoozeInput = {
        by: '2h',
        commandId: 'dm-reminder-snooze',
        expectedVersion: scheduled.body.reminder?.version,
        id: reminderId,
    };
    const snoozed = await agentPost(minted.runnerToken, '/api/agent/reminders/snooze', snoozeInput);
    expect(snoozed.status).toBe(200);
    expect(snoozed.body.reminder).toMatchObject({ id: reminderId, status: 'scheduled' });
    const snoozedAgain = await agentPost(
        minted.runnerToken,
        '/api/agent/reminders/snooze',
        snoozeInput
    );
    expect(snoozedAgain.body.reminder).toEqual(snoozed.body.reminder);

    const canceled = await agentPost(minted.runnerToken, '/api/agent/reminders/cancel', {
        commandId: 'dm-reminder-cancel',
        expectedVersion: snoozed.body.reminder?.version,
        id: reminderId,
    });
    expect(canceled.status).toBe(200);
    expect(canceled.body.reminder).toMatchObject({ id: reminderId, status: 'canceled' });
});

test('a revoked runner token can no longer speak as the Agent', async () => {
    const minted = await mintRunner({ chatId: dmChatId, runId: 'run_revoke_1' });
    const revoke = await fetch(new URL('/computer/runner/revoke', harness.url), {
        body: JSON.stringify({ credentialHash, runnerId: minted.runnerId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(revoke.status).toBe(200);

    const blocked = await agentSend(minted.runnerToken, {
        content: 'Should not land.',
        nonce: 'agent_nonce_revoked',
        target: 'dm:@ada',
    });
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('MISSING_TOKEN');
});

test('rejects a runner mint for an Agent on another Computer', async () => {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId,
            chatId: dmChatId,
            credentialHash: 'e'.repeat(64),
            runId: 'run_wrong_computer',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(403);
});

test('durable delivery sends one typed start, serializes per Agent, and needs an online Computer', async () => {
    const frames: {
        agentId?: string;
        modelId?: string;
        runId?: string;
        runtimeId?: string;
        type: string;
    }[] = [];
    const connections = makeConnections();
    const delivery = new AgentDelivery(connection.db, connections);

    // Offline: the message is queued durably but nothing reaches the wire.
    await delivery.deliver({
        agentId,
        chatId: dmChatId,
        content: 'first',
        dedupeKey: 'run_deliver_1',
        serverId,
    });
    expect(frames).toHaveLength(0);

    // Attaching the Computer and reconciling delivers the queued run exactly once.
    connections.register(computerId, {
        ordinary: true,
        send: (frame) => frames.push(frame as (typeof frames)[number]),
        serverId,
        updatePhase: 'idle',
    });
    await delivery.onComputerReconnect(computerId);
    const starts = () =>
        frames.filter((frame) => frame.agentId === agentId && frame.type === 'start');
    expect(starts()).toHaveLength(1);
    expect(starts()[0]).toMatchObject({
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        type: 'start',
    });
    const runId = starts()[0]?.runId ?? '';
    await delivery.onAck({ agentId, runId });

    // Busy: a second message queues and notices, never a second concurrent start.
    await delivery.deliver({
        agentId,
        chatId: dmChatId,
        content: 'second',
        dedupeKey: 'run_deliver_2',
        serverId,
    });
    expect(starts()).toHaveLength(1);
    expect(frames.some((frame) => frame.type === 'notice')).toBe(true);

    // The safe boundary: settling the run drains the queued work into the next.
    await delivery.onTurnSettled(computerId, {
        activity: { operations: [] },
        agentId,
        endedAt: '2026-07-27T00:00:01.000Z',
        messageCount: 0,
        modelId: 'gpt-test',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: '2026-07-27T00:00:00.000Z',
        status: 'completed',
        summary: 'ok',
        tokenUsage: null,
        type: 'turn',
    });
    expect(starts()).toHaveLength(2);
});

test('an Owner imports a Computer-reported host skill into exactly one assigned Agent', async () => {
    const sourceId = 'hsk_skillimport00000';
    await harness.sql`
        update computers
        set reported_inventory = ${{
            importableSkills: [
                {
                    description: 'Release checks',
                    id: sourceId,
                    name: 'release-checks',
                    source: '~/.agents/skills/release-checks',
                },
            ],
            runtimes: [codexRuntime],
        }}::jsonb
        where id = ${computerId}
    `;
    const frames: Record<string, unknown>[] = [];
    let reportSent: (() => void) | undefined;
    const sent = new Promise<void>((resolve) => {
        reportSent = resolve;
    });
    const computers = makeConnections();
    computers.register(computerId, {
        ordinary: true,
        send: (frame) => {
            frames.push(frame as Record<string, unknown>);
            reportSent?.();
        },
        serverId,
        updatePhase: 'idle',
    });
    const imported = importAgentSkill(
        connection.db,
        computers,
        { clerkUserId: 'user_run_owner', id: ownerUserId },
        { agentId, serverId, sourceId }
    );
    await sent;
    const requestId = String(frames[0]?.requestId);
    expect(frames[0]).toMatchObject({ agentId, sourceId, type: 'agent-skill-import' });
    computers.acceptSkillImport(computerId, {
        agentId,
        requestId,
        sourceId,
        status: 'accepted',
        type: 'agent-skill-import-result',
        updatedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(await imported).toEqual({ requestId, status: 'accepted' });
});

test('a Member cannot relay Agent skill file bytes through the Server', async () => {
    const memberUserId = 'usr_skillmember0000';
    await harness.sql`
        insert into users (id, clerk_user_id)
        values (${memberUserId}, 'user_skill_member')
        on conflict do nothing
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_skillmember0000', ${serverId}, ${memberUserId}, 'member')
        on conflict do nothing
    `;
    await expect(
        readAgentSkillFile(
            connection.db,
            makeConnections(),
            { clerkUserId: 'user_skill_member', id: memberUserId },
            { agentId, name: 'agent-browser', serverId }
        )
    ).rejects.toThrow(/Owner or Admin/u);
});

test('a human DM send enqueues durable pending work atomically with the message', async () => {
    // The Agent's Computer is offline in this harness, so nothing reaches the
    // wire — but a committed human message must still leave durable pending work.
    const before = (await harness.sql`
        select count(*)::int as n from agent_inbox
        where server_id = ${serverId} and agent_id = ${agentId}
    `) as { n: number }[];

    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Durable delivery, please.',
        nonce: 'human_wake_1',
        serverId,
    });

    const after = (await harness.sql`
        select content from agent_inbox
        where server_id = ${serverId} and agent_id = ${agentId}
        order by created_at desc limit 1
    `) as { content: string }[];
    const count = (await harness.sql`
        select count(*)::int as n from agent_inbox
        where server_id = ${serverId} and agent_id = ${agentId}
    `) as { n: number }[];
    expect(count[0]?.n).toBe((before[0]?.n ?? 0) + 1);
    expect(after[0]?.content).toBe('Durable delivery, please.');
});
test('keeps MCP credentials on Server and grants one whole connection', async () => {
    const member = { clerkUserId: 'user_run_owner', id: ownerUserId };
    const runtime = new McpRuntime(connection.db, serverEffectRuntime);
    const created = await createMcpConnection(connection.db, runtime, mcpIconResolver, member, {
        auth: 'oauth',
        headers: {},
        name: 'Deterministic',
        oauthClientId: 'server-client',
        oauthClientSecret: 'server-secret',
        oauthScopes: [],
        serverId,
        url: 'http://127.0.0.1:9999/mcp',
    });
    const rows = (await harness.sql`
        select auth, header_names, tools
        from mcp_connections where id = ${created.id}
    `) as { auth: string; header_names: string[]; tools: string[] }[];
    expect(rows[0]).toMatchObject({
        auth: 'oauth',
        header_names: [],
        tools: [],
    });
    expect(JSON.stringify(rows)).not.toContain('server-secret');
    const secrets = (await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `) as { secret: Record<string, unknown> }[];
    expect(JSON.stringify(secrets[0]?.secret)).toContain('server-secret');
    await harness.sql`
        update mcp_connections
        set account_label = 'Fixture account', connected = true, tools = ARRAY['echo']
        where id = ${created.id}
    `;
    await setMcpGrant(connection.db, member, {
        agentId,
        connectionId: created.id,
        enabled: true,
        serverId,
    });

    const grants = (await harness.sql`
        select agent_id, connection_id from agent_mcp_connection_grants
        where server_id = ${serverId} and agent_id = ${agentId}
    `) as { agent_id: string; connection_id: string }[];
    expect(grants).toEqual([{ agent_id: agentId, connection_id: created.id }]);

    const listed = await listMcpConnections(connection.db, member, serverId);
    expect(listed.find((item) => item.id === created.id)).toMatchObject({
        grants: [{ agentId, connectionId: created.id }],
        status: 'online',
        tools: ['echo'],
    });
    await disconnectMcpConnection(connection.db, runtime, member, {
        connectionId: created.id,
        serverId,
    });
    const disconnectedSecrets = (await harness.sql`
        select secret from mcp_secrets where connection_id = ${created.id}
    `) as { secret: Record<string, unknown> }[];
    expect(disconnectedSecrets[0]?.secret).toMatchObject({
        configuredClientInformation: {
            client_id: 'server-client',
            client_secret: 'server-secret',
        },
    });
    expect(
        (
            await harness.sql`
            select count(*)::int as n from agent_mcp_connection_grants
            where server_id = ${serverId} and connection_id = ${created.id}
        `
        )[0]?.n
    ).toBe(0);
    await runtime.close();
});

test('Server discovers and invokes a granted remote MCP without Computer custody', async () => {
    const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
    const mcp = Bun.serve({
        fetch: async (request) => {
            if (request.method !== 'POST') {
                return new Response(null, { status: 405 });
            }
            const message = (await request.json()) as {
                id?: number;
                method: string;
                params?: Record<string, unknown>;
            };
            calls.push({ method: message.method, params: message.params });
            if (message.method === 'notifications/initialized') {
                return new Response(null, { status: 202 });
            }
            const result =
                message.method === 'initialize'
                    ? {
                          capabilities: { tools: {} },
                          protocolVersion: String(message.params?.protocolVersion),
                          serverInfo: { name: 'Server fixture', version: '1.0.0' },
                      }
                    : message.method === 'tools/list'
                      ? {
                            tools: [
                                {
                                    description: 'Echo text from the fixture.',
                                    inputSchema: {
                                        additionalProperties: false,
                                        properties: { text: { type: 'string' } },
                                        required: ['text'],
                                        type: 'object',
                                    },
                                    name: 'echo',
                                },
                            ],
                        }
                      : message.method === 'tools/call'
                        ? {
                              content: [
                                  {
                                      text: String(
                                          (
                                              message.params?.arguments as
                                                  | { text?: string }
                                                  | undefined
                                          )?.text ?? ''
                                      ),
                                      type: 'text',
                                  },
                              ],
                          }
                        : null;
            return Response.json({ id: message.id, jsonrpc: '2.0', result });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    const runtime = new McpRuntime(connection.db, serverEffectRuntime);
    try {
        const member = { clerkUserId: 'user_run_owner', id: ownerUserId };
        const created = await createMcpConnection(connection.db, runtime, mcpIconResolver, member, {
            auth: 'none',
            headers: {},
            name: 'Server fixture',
            oauthScopes: [],
            serverId,
            url: `http://127.0.0.1:${mcp.port}/mcp`,
        });
        await setMcpGrant(connection.db, member, {
            agentId,
            connectionId: created.id,
            enabled: true,
            serverId,
        });

        const tools = await runtime.listAgentTools(serverId, agentId);
        expect(tools).toHaveLength(1);
        expect(tools[0]).toMatchObject({ description: 'Echo text from the fixture.' });
        const result = await runtime.invoke({
            agentId,
            args: { text: 'server-owned' },
            serverId,
            toolName: tools[0]?.name ?? '',
        });
        expect(result).toMatchObject({
            content: [{ text: 'server-owned', type: 'text' }],
        });
        expect(calls.map((call) => call.method)).toContain('tools/call');
    } finally {
        await runtime.close();
        mcp.stop(true);
    }
});

test('a slow MCP discovery is bounded without hiding healthy granted tools', async () => {
    const healthyId = 'mcp_healthyruntime00';
    const slowId = 'mcp_slowruntime00000';
    const healthy = createMcpFixture({
        toolName: 'healthy_echo',
    });
    const slow = createMcpFixture({
        delayMs: 200,
        toolName: 'slow_echo',
    });
    const runtime = new McpRuntime(connection.db, serverEffectRuntime, { discoveryTimeoutMs: 25 });
    try {
        for (const fixture of [
            { id: healthyId, server: healthy, tool: 'healthy_echo' },
            { id: slowId, server: slow, tool: 'slow_echo' },
        ]) {
            await harness.sql`
                insert into mcp_connections (
                    id, account_label, server_id, name, auth, url, connected,
                    header_names, preset, tools
                ) values (
                    ${fixture.id}, 'Fixture', ${serverId}, ${fixture.tool}, 'none',
                    ${`http://127.0.0.1:${fixture.server.port}/mcp`}, true,
                    ARRAY[]::text[], null, ARRAY[${fixture.tool}]
                )
            `;
            await harness.sql`
                insert into mcp_secrets (connection_id, secret)
                values (
                    ${fixture.id},
                    ${{ approvedAuthorizationServerOrigins: [], headers: {}, oauthScopes: [] }}::jsonb
                )
            `;
            await harness.sql`
                insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
                values (${serverId}, ${agentId}, ${fixture.id})
            `;
        }

        const startedAt = performance.now();
        const tools = await runtime.listAgentTools(serverId, agentId);
        expect(performance.now() - startedAt).toBeLessThan(150);
        expect(tools.map((tool) => tool.name)).toEqual([modelToolName(healthyId, 'healthy_echo')]);
    } finally {
        await runtime.close();
        healthy.stop(true);
        slow.stop(true);
        await harness.sql`
            delete from mcp_connections where id in (${healthyId}, ${slowId})
        `;
    }
});

test('MCP invocation distinguishes revoked access, timeout, and upstream auth', async () => {
    const timeoutId = 'mcp_timeoutruntime00';
    const authId = 'mcp_authruntime00000';
    const timeout = createMcpFixture({ delayMs: 200, toolName: 'wait' });
    const auth = Bun.serve({
        fetch: () => new Response('reauthorize', { status: 401 }),
        hostname: '127.0.0.1',
        port: 0,
    });
    const runtime = new McpRuntime(connection.db, serverEffectRuntime, {
        discoveryTimeoutMs: 25,
        invocationTimeoutMs: 25,
    });
    try {
        for (const fixture of [
            { id: timeoutId, server: timeout, tool: 'wait' },
            { id: authId, server: auth, tool: 'reauthorize' },
        ]) {
            await harness.sql`
                insert into mcp_connections (
                    id, account_label, server_id, name, auth, url, connected,
                    header_names, preset, tools
                ) values (
                    ${fixture.id}, 'Fixture', ${serverId}, ${fixture.tool}, 'none',
                    ${`http://127.0.0.1:${fixture.server.port}/mcp`}, true,
                    ARRAY[]::text[], null, ARRAY[${fixture.tool}]
                )
            `;
            await harness.sql`
                insert into mcp_secrets (connection_id, secret)
                values (
                    ${fixture.id},
                    ${{ approvedAuthorizationServerOrigins: [], headers: {}, oauthScopes: [] }}::jsonb
                )
            `;
            await harness.sql`
                insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
                values (${serverId}, ${agentId}, ${fixture.id})
            `;
        }

        await harness.sql`
            delete from agent_mcp_connection_grants
            where server_id = ${serverId} and agent_id = ${agentId} and connection_id = ${timeoutId}
        `;
        await expect(
            runtime.invoke({
                agentId,
                args: {},
                serverId,
                toolName: modelToolName(timeoutId, 'wait'),
            })
        ).rejects.toBeInstanceOf(McpDeniedError);

        await harness.sql`
            insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
            values (${serverId}, ${agentId}, ${timeoutId})
        `;
        await expect(
            runtime.invoke({
                agentId,
                args: {},
                serverId,
                toolName: modelToolName(timeoutId, 'wait'),
            })
        ).rejects.toMatchObject<Partial<McpUpstreamError>>({ code: 'MCP_TIMEOUT' });
        await expect(
            runtime.invoke({
                agentId,
                args: {},
                serverId,
                toolName: modelToolName(authId, 'reauthorize'),
            })
        ).rejects.toMatchObject<Partial<McpUpstreamError>>({
            code: 'MCP_AUTH_REQUIRED',
        });

        const runner = await mintRunner({ chatId: dmChatId, runId: 'run_mcp_errors' });
        const deniedResponse = await invokeAgentMcp(runner.runnerToken, {
            args: {},
            toolName: modelToolName('mcp_notgranted0000', 'missing'),
        });
        expect(deniedResponse).toMatchObject({
            body: { code: 'MCP_DENIED' },
            status: 403,
        });
        const authResponse = await invokeAgentMcp(runner.runnerToken, {
            args: {},
            toolName: modelToolName(authId, 'reauthorize'),
        });
        expect(authResponse).toMatchObject({ body: { code: 'MCP_AUTH_REQUIRED' }, status: 502 });
    } finally {
        await runtime.close();
        timeout.stop(true);
        auth.stop(true);
        await harness.sql`
            delete from mcp_connections where id in (${timeoutId}, ${authId})
        `;
    }
});

test('records a compact turn summary and fails closed on cross-Computer claims', async () => {
    const summary = {
        activity: {
            operations: [
                {
                    category: 'running_command' as const,
                    completed: 2,
                    failed: 0,
                    interrupted: 0,
                },
            ],
        },
        agentId,
        endedAt: '2026-07-27T00:00:01.000Z',
        messageCount: 1,
        modelId: 'gpt-test',
        outputProduced: true,
        runId: 'run_turn_1',
        runtimeId: 'codex',
        startedAt: '2026-07-27T00:00:00.000Z',
        status: 'completed' as const,
        summary: 'Sent 1 message(s).',
        tokenUsage: {
            cacheReadTokens: 8,
            cacheWriteTokens: 2,
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
        },
        type: 'turn' as const,
    };
    await recordAgentTurnSummary(connection.db, computerId, summary);
    const rows = (await harness.sql`
        select activity, status, message_count, model_id, runtime_id, total_tokens, token_usage_reported
        from agent_turns
        where server_id = ${serverId} and agent_id = ${agentId} and run_id = 'run_turn_1'
    `) as {
        activity: { operations: Array<{ category: string; completed: number }> };
        message_count: number;
        model_id: string;
        runtime_id: string;
        status: string;
        token_usage_reported: boolean;
        total_tokens: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        activity: { operations: [{ category: 'running_command', completed: 2 }] },
        message_count: 1,
        model_id: 'gpt-test',
        runtime_id: 'codex',
        status: 'completed',
        token_usage_reported: true,
        total_tokens: 15,
    });

    // A summary from a Computer that does not own the Agent writes nothing.
    await recordAgentTurnSummary(connection.db, 'cmp_notowner00000000', {
        ...summary,
        runId: 'run_turn_foreign',
    });
    const foreign = (await harness.sql`
        select count(*)::int as n from agent_turns where run_id = 'run_turn_foreign'
    `) as { n: number }[];
    expect(foreign[0]?.n).toBe(0);
});

function createMcpFixture(input: { delayMs?: number; toolName: string }) {
    return Bun.serve({
        fetch: async (request) => {
            if (input.delayMs) {
                await Bun.sleep(input.delayMs);
            }
            if (request.method !== 'POST') {
                return new Response(null, { status: 405 });
            }
            const message = (await request.json()) as {
                id?: number;
                method: string;
                params?: Record<string, unknown>;
            };
            if (message.method === 'notifications/initialized') {
                return new Response(null, { status: 202 });
            }
            const result =
                message.method === 'initialize'
                    ? {
                          capabilities: { tools: {} },
                          protocolVersion: String(message.params?.protocolVersion),
                          serverInfo: { name: 'MCP fixture', version: '1.0.0' },
                      }
                    : message.method === 'tools/list'
                      ? {
                            tools: [
                                {
                                    inputSchema: {
                                        additionalProperties: false,
                                        properties: {},
                                        type: 'object',
                                    },
                                    name: input.toolName,
                                },
                            ],
                        }
                      : message.method === 'tools/call'
                        ? { content: [{ text: 'ok', type: 'text' }] }
                        : null;
            return Response.json({ id: message.id, jsonrpc: '2.0', result });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
}

async function mintRunner(input: { agentId?: string; chatId: string; runId: string }) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: input.agentId ?? agentId,
            chatId: input.chatId,
            credentialHash,
            runId: input.runId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`mint failed: ${response.status}`);
    }
    return (await response.json()) as { runnerId: string; runnerToken: string };
}

const invokeAgentMcp = (token: string, body: Parameters<typeof invokeMcp>[2]) =>
    invokeMcp(harness.url, token, body);

async function agentSend(
    token: string,
    body: {
        attachmentIds?: string[];
        compositionId?: string;
        content?: string;
        continueAnyway?: boolean;
        nonce: string;
        sendDraft?: boolean;
        target: string;
    }
) {
    const response = await fetch(new URL('/api/agent/messages/send', harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const payload = (await response.json()) as {
        code?: string;
        continueAnywaySuggested?: boolean;
        formalMentionCount?: number;
        message?: {
            attachments: Record<string, unknown>[];
            chat_id: string;
            content: string;
            id: string;
            sender: unknown;
        };
        recentUnread?: unknown[];
        reholdCount?: number;
        shownMessages?: Record<string, unknown>[];
        state?: string;
    };
    return { body: payload, status: response.status };
}

async function agentGet(token: string, path: string, query: Record<string, string>) {
    const url = new URL(path, harness.url);
    for (const [name, value] of Object.entries(query)) {
        url.searchParams.set(name, value);
    }
    const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
    });
    return {
        body: (await response.json()) as {
            code?: string;
            channels?: Record<string, unknown>[];
            attachment?: Record<string, unknown>;
            message?: Record<string, unknown>;
            members?: Record<string, unknown>[];
            messages?: Array<Record<string, unknown> & { attachments?: unknown; id?: string }>;
            profile?: Record<string, unknown>;
            reminders?: Record<string, unknown>[];
            rows?: Array<Record<string, unknown> & { chatId?: string; mentioned?: boolean }>;
            tasks?: Record<string, unknown>[];
            thread_follow_reactivated_message_ids?: string[];
        },
        status: response.status,
    };
}

async function agentPost(token: string, path: string, body: Record<string, unknown>) {
    const response = await fetch(new URL(path, harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as {
            claimed?: Record<string, unknown>[];
            code?: string;
            joined?: boolean;
            left?: boolean;
            attachment?: Record<string, unknown>;
            message?: Record<string, unknown>;
            profile?: Record<string, unknown>;
            reminder?: Record<string, unknown>;
            target?: string;
            task?: Record<string, unknown>;
            tasks?: Array<{
                message: { id: string };
                number: number;
            }>;
            unfollowed?: boolean;
        },
        status: response.status,
    };
}

async function signIn(clerkUserId: string) {
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}

async function readUserId(clerkUserId: string) {
    const rows = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    return rows[0].id;
}
