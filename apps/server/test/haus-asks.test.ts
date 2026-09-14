import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Ask } from '@haus/api';
import { recordExactMessagesServed } from '../src/agent-delivery/cursors.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let database: HausConnection;
let owner: HausClient;
let peer: HausClient;
let outsider: HausClient;

let serverId: string;
let channelId: string;
let orbitAgentId: string;
let scoutAgentId: string;
let ownerUserId: string;
let peerUserId: string;

const computerId = `cmp_${'b'.repeat(16)}`;
const credentialHash = 'b'.repeat(64);

beforeAll(async () => {
    harness = await startHausServerHarness();
    database = await connectHausDatabase(harness.databaseUrl);
    owner = await signIn('user_ask_owner', ['ada@haus.test']);
    peer = await signIn('user_ask_peer', ['bo@haus.test']);
    outsider = await signIn('user_ask_outsider', ['cass@haus.test']);

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Ask HQ',
        slug: 'ask-hq',
    });
    serverId = server.id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    await join(peer, 'bo@haus.test', 'Bo', 'bo');
    await join(outsider, 'cass@haus.test', 'Cass', 'cass');
    ownerUserId = await readUserId('user_ask_owner');
    peerUserId = await readUserId('user_ask_peer');

    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    orbitAgentId = await createAgent('Orbit', 'orbit');
    scoutAgentId = await createAgent('Scout', 'scout');
    channelId = (
        await owner.trpc.chat.createChannel.mutate({
            agentIds: [orbitAgentId, scoutAgentId],
            name: 'product',
            serverId,
        })
    ).id;
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${peerUserId})
    `;
});

afterAll(async () => {
    owner.close();
    peer.close();
    outsider.close();
    await database.close();
    await harness.close();
});

test('one Ask writes its Message, record, Thread, and events, and replays by nonce', async () => {
    const runner = await mintRunner(orbitAgentId, 'run_ask_top_level');
    const head = await owner.trpc.chat.eventHead.query({ serverId });

    const created = await postAsk(runner, {
        addresseeHandle: 'ada',
        content: '@ada, the migration is staged. Should I run it now?',
        nonce: 'ask-top-level',
        options: ['Approve the staged migration', 'Wait for the release window'],
        summary: 'The migration is staged and reversible for one hour.',
        target: '#product',
        title: 'Run the staged migration?',
    });

    expect(created.status).toBe(200);
    const ask = created.body.ask as Ask;
    expect(created.body).toMatchObject({
        ask: {
            addresseeUserId: ownerUserId,
            agentId: orbitAgentId,
            answerMessageId: null,
            answeredBy: null,
            chatId: channelId,
            options: ['Approve the staged migration', 'Wait for the release window'],
            status: 'open',
            title: 'Run the staged migration?',
        },
        chatId: channelId,
        idempotent: false,
        target: '#product',
    });

    const threadChatId = `cht_thr_${(created.body.messageId as string).slice('msg_'.length)}`;
    const threadRows = (await harness.sql`
        select id, parent_chat_id, anchor_message_id from chats where id = ${threadChatId}
    `) as { anchor_message_id: string; parent_chat_id: string }[];
    expect(threadRows[0]).toMatchObject({
        anchor_message_id: created.body.messageId,
        parent_chat_id: channelId,
    });

    const events = await owner.trpc.chat.events.query({ afterCursor: head.cursor, serverId });
    expect(events.map((event) => event.type)).toEqual(['message.created', 'ask.updated']);
    expect(events[1]).toMatchObject({
        askId: ask.id,
        chatId: channelId,
        messageId: created.body.messageId,
        type: 'ask.updated',
    });

    const replay = await postAsk(runner, {
        addresseeHandle: 'ada',
        content: '@ada, the migration is staged. Should I run it now?',
        nonce: 'ask-top-level',
        options: ['Approve the staged migration', 'Wait for the release window'],
        summary: 'The migration is staged and reversible for one hour.',
        target: '#product',
        title: 'Run the staged migration?',
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ ask: { id: ask.id }, idempotent: true });
    expect(
        (
            (await harness.sql`
                select count(*)::int as total from asks where server_id = ${serverId}
            `) as { total: number }[]
        )[0].total
    ).toBe(1);

    const conflict = await postAsk(runner, {
        addresseeHandle: 'ada',
        content: 'A different question entirely.',
        nonce: 'ask-top-level',
        options: ['Approve the staged migration', 'Wait for the release window'],
        summary: 'The migration is staged and reversible for one hour.',
        target: '#product',
        title: 'Run the staged migration?',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('ASK_IDEMPOTENCY_CONFLICT');
});

test('the one Message reader projects text and ask bodies for every consumer', async () => {
    const page = await owner.trpc.chat.messages.query({ chatId: channelId, serverId });
    const askMessage = page.messages.find((message) => message.body.kind === 'ask');
    expect(askMessage).toMatchObject({
        body: { ask: { status: 'open', title: 'Run the staged migration?' }, kind: 'ask' },
        content: `[@ada](user://${ownerUserId}), the migration is staged. Should I run it now?`,
    });

    const sent = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'An ordinary message.',
        nonce: 'ask-text-body',
        serverId,
    });
    expect(sent.message.body).toEqual({ kind: 'text' });

    const found = await owner.trpc.chat.search.query({ query: 'staged', serverId });
    expect(found[0]?.body).toMatchObject({ kind: 'ask' });
});

test('an ineligible addressee or an unreachable target creates nothing', async () => {
    const runner = await mintRunner(orbitAgentId, 'run_ask_rejected');
    const before = await countAsks();

    const unknownHuman = await postAsk(runner, askBody({ addresseeHandle: 'nobody' }));
    expect(unknownHuman.status).toBe(404);
    expect(unknownHuman.body.code).toBe('ASK_ADDRESSEE_NOT_FOUND');

    // Humans and Agents share one handle namespace, so an Agent handle simply
    // finds no membership and fails closed.
    const agentHandle = await postAsk(runner, askBody({ addresseeHandle: 'scout' }));
    expect(agentHandle.status).toBe(404);

    // 'cass' is an active Server member with no access to #product.
    const noChatAccess = await postAsk(runner, askBody({ addresseeHandle: 'cass' }));
    expect(noChatAccess.status).toBe(404);
    expect(noChatAccess.body.code).toBe('ASK_ADDRESSEE_NOT_FOUND');

    const unjoinedChannel = await postAsk(runner, askBody({ target: '#nowhere' }));
    expect(unjoinedChannel.status).toBe(404);
    expect(unjoinedChannel.body.code).toBe('INVALID_TARGET');

    expect(await countAsks()).toBe(before);
    expect(
        (await owner.trpc.chat.messages.query({ chatId: channelId, serverId })).messages.filter(
            (message) => message.nonce.startsWith('ask-rejected')
        ).length
    ).toBe(0);
});

test('a human reply settles the Ask once, and later replies leave it alone', async () => {
    const runner = await mintRunner(orbitAgentId, 'run_ask_human_answer');
    const created = await postAsk(
        runner,
        askBody({ addresseeHandle: 'ada', nonce: 'ask-human-answer' })
    );
    const askId = (created.body.ask as Ask).id;
    const anchorMessageId = created.body.messageId as string;

    const head = await owner.trpc.chat.eventHead.query({ serverId });
    const answer = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Approve the staged migration',
        nonce: 'ask-human-answer-reply',
        serverId,
        thread: { anchorMessageId },
    });

    expect(await readAsk(askId)).toMatchObject({
        answer_message_id: answer.message.id,
        answered_by_agent_id: null,
        answered_by_user_id: ownerUserId,
        status: 'answered',
    });
    const events = await owner.trpc.chat.events.query({ afterCursor: head.cursor, serverId });
    expect(events.map((event) => event.type)).toEqual(['message.created', 'ask.updated']);

    const second = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Second opinion.',
        nonce: 'ask-human-answer-second',
        serverId,
        thread: { anchorMessageId },
    });
    expect(await readAsk(askId)).toMatchObject({
        answer_message_id: answer.message.id,
        answered_by_user_id: ownerUserId,
    });
    expect(second.message.id).not.toBe(answer.message.id);
    expect(
        (await owner.trpc.ask.listOpen.query({ serverId })).some((row) => row.ask.id === askId)
    ).toBe(false);
});

test('another Agent settles an Ask; the asking Agent replying to itself does not', async () => {
    const orbit = await mintRunner(orbitAgentId, 'run_ask_agent_answer');
    const created = await postAsk(
        orbit,
        askBody({ addresseeHandle: 'ada', nonce: 'ask-agent-answer' })
    );
    const askId = (created.body.ask as Ask).id;
    const threadTarget = `#product:${(created.body.messageId as string).slice('msg_'.length, 'msg_'.length + 8)}`;

    const selfReply = await sendAgentMessage(orbit, threadTarget, 'ask-agent-self-reply', 'Bump.');
    expect(selfReply.status).toBe(200);
    expect(selfReply.body.state).toBe('sent');
    expect(await readAsk(askId)).toMatchObject({ answered_by_agent_id: null, status: 'open' });

    const scout = await mintRunner(scoutAgentId, 'run_ask_scout_answer');
    const peerReply = await sendAgentMessage(
        scout,
        threadTarget,
        'ask-agent-peer-reply',
        'I already ran it in staging; go ahead.'
    );
    expect(peerReply.status).toBe(200);
    expect(peerReply.body.state).toBe('sent');
    expect(await readAsk(askId)).toMatchObject({
        answered_by_agent_id: scoutAgentId,
        answered_by_user_id: null,
        status: 'answered',
    });
});

test('an Ask inside an existing Thread stays there and answers in that Thread', async () => {
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Release checklist',
        nonce: 'ask-thread-anchor',
        serverId,
    });
    const opener = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Starting the checklist.',
        nonce: 'ask-thread-opener',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = opener.threadChatId as string;
    const shortId = anchor.message.id.slice('msg_'.length, 'msg_'.length + 8);

    const runner = await mintRunner(orbitAgentId, 'run_ask_in_thread');
    const created = await postAsk(
        runner,
        askBody({
            addresseeHandle: 'ada',
            nonce: 'ask-in-thread',
            target: `#product:${shortId}`,
        })
    );

    expect(created.status).toBe(200);
    expect(created.body.chatId).toBe(threadChatId);
    const askMessageId = created.body.messageId as string;
    expect(
        (
            (await harness.sql`
                select count(*)::int as total from chats
                where id = ${`cht_thr_${askMessageId.slice('msg_'.length)}`}
            `) as { total: number }[]
        )[0].total
    ).toBe(0);

    // The row must carry the conversation the answer is addressed to and the
    // Message the Thread hangs off, or the Inbox can neither answer nor peek.
    const row = (await owner.trpc.ask.listOpen.query({ serverId })).find(
        (open) => open.ask.messageId === askMessageId
    );
    expect(row).toMatchObject({
        ask: { chatId: threadChatId, status: 'open' },
        chatKind: 'channel',
        chatName: 'product',
        conversationChatId: channelId,
        message: { body: { kind: 'ask' } },
        threadAnchorMessage: {
            body: { kind: 'text' },
            content: 'Release checklist',
            id: anchor.message.id,
        },
        threadChatId,
    });

    const topLevel = (await owner.trpc.ask.listOpen.query({ serverId })).find(
        (open) => open.ask.chatId === channelId
    );
    // A top-level Ask is its own Thread anchor, so it carries no second one.
    expect(topLevel).toMatchObject({ conversationChatId: channelId, threadAnchorMessage: null });

    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Yes, proceed.',
        nonce: 'ask-in-thread-answer',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    expect(await readAsk((created.body.ask as Ask).id)).toMatchObject({ status: 'answered' });
});

test('Agent history reads an Ask Message with its body kind and Ask facts', async () => {
    const runner = await mintRunner(orbitAgentId, 'run_ask_history');
    const created = await postAsk(
        runner,
        askBody({ addresseeHandle: 'ada', nonce: 'ask-history', title: 'Cut the hotfix?' })
    );
    expect(created.status).toBe(200);
    const ordinary = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Reading the room.',
        nonce: 'ask-history-text',
        serverId,
    });

    const url = new URL('/api/agent/history', harness.url);
    url.searchParams.set('target', '#product');
    const response = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        messages: Array<{ ask?: Record<string, unknown>; body_kind: string; id: string }>;
    };
    const askMessage = body.messages.find((row) => row.id === created.body.messageId);
    expect(askMessage).toMatchObject({
        ask: {
            addressee_handle: 'ada',
            id: (created.body.ask as Ask).id,
            options: ['Approve the staged migration', 'Wait for the release window'],
            status: 'open',
            title: 'Cut the hotfix?',
        },
        body_kind: 'ask',
    });
    // Ordinary Messages state their kind too, and carry no Ask.
    const plain = body.messages.find((row) => row.id === ordinary.message.id);
    expect(plain?.body_kind).toBe('text');
    expect(plain?.ask).toBeUndefined();
});

test('listOpen returns only the viewer’s open Asks and fails closed on lost access', async () => {
    const runner = await mintRunner(orbitAgentId, 'run_ask_list_open');
    const created = await postAsk(
        runner,
        askBody({ addresseeHandle: 'bo', nonce: 'ask-for-bo', title: 'Cut the release?' })
    );
    const askId = (created.body.ask as Ask).id;

    const forBo = await peer.trpc.ask.listOpen.query({ serverId });
    expect(forBo.map((row) => row.ask.id)).toContain(askId);
    expect(forBo.find((row) => row.ask.id === askId)).toMatchObject({
        ask: { addresseeUserId: peerUserId, title: 'Cut the release?' },
        chatKind: 'channel',
        chatName: 'product',
        chatPeerUserId: null,
        message: { author: { kind: 'agent' }, body: { kind: 'ask' } },
        threadChatId: `cht_thr_${(created.body.messageId as string).slice('msg_'.length)}`,
    });
    expect(
        (await owner.trpc.ask.listOpen.query({ serverId })).map((row) => row.ask.id)
    ).not.toContain(askId);
    await expect(outsider.trpc.ask.listOpen.query({ serverId })).resolves.toEqual([]);

    await harness.sql`
        delete from channel_participants
        where server_id = ${serverId} and chat_id = ${channelId} and user_id = ${peerUserId}
    `;
    expect(
        (await peer.trpc.ask.listOpen.query({ serverId })).map((row) => row.ask.id)
    ).not.toContain(askId);
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${serverId}, ${channelId}, ${peerUserId})
    `;
});

function askBody(overrides: Record<string, string> = {}) {
    return {
        addresseeHandle: 'ada',
        content: '@ada, the migration is staged. Should I run it now?',
        nonce: `ask-rejected-${overrides.nonce ?? Math.random().toString(36).slice(2)}`,
        options: ['Approve the staged migration', 'Wait for the release window'],
        summary: 'The migration is staged and reversible for one hour.',
        target: '#product',
        title: 'Run the staged migration?',
        ...overrides,
    };
}

async function postAsk(runner: { token: string } | null, body: Record<string, string>) {
    const response = await fetch(new URL('/api/agent/asks', harness.url), {
        body: JSON.stringify(body),
        headers: {
            ...(runner ? { authorization: `Bearer ${runner.token}` } : {}),
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    return {
        body: (await response.json()) as {
            ask?: Ask;
            chatId?: string;
            code?: string;
            idempotent?: boolean;
            messageId?: string;
            target?: string;
        },
        status: response.status,
    };
}

/**
 * Reading the target and recording that exact visibility is what the Computer
 * proxy does for a real turn; without it the send is freshness-held.
 */
async function readAgentHistory(
    runner: { agentId: string; runId: string; token: string },
    target: string
) {
    const url = new URL('/api/agent/history', harness.url);
    url.searchParams.set('target', target);
    const response = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        messages?: Array<{ chat_id: string; id: string }>;
    };
    await recordExactMessagesServed(database.db, {
        agentId: runner.agentId,
        messages: (body.messages ?? []).map((message) => ({
            chatId: message.chat_id,
            id: message.id,
        })),
        runId: runner.runId,
        serverId,
    });
}

async function sendAgentMessage(
    runner: { agentId: string; runId: string; token: string },
    target: string,
    nonce: string,
    content: string
) {
    await readAgentHistory(runner, target);
    const response = await fetch(new URL('/api/agent/messages/send', harness.url), {
        body: JSON.stringify({ content, nonce, target }),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as { state?: string },
        status: response.status,
    };
}

async function mintRunner(agentId: string, runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId: channelId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    const { runnerToken } = (await response.json()) as { runnerToken: string };
    return { agentId, runId, token: runnerToken };
}

async function createAgent(displayName: string, handle: string) {
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName,
        handle,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    return created.agent.id;
}

async function readAsk(askId: string) {
    const rows = (await harness.sql`
        select answer_message_id, answered_by_agent_id, answered_by_user_id, status
        from asks where id = ${askId}
    `) as Array<{
        answer_message_id: string | null;
        answered_by_agent_id: string | null;
        answered_by_user_id: string | null;
        status: string;
    }>;
    return rows[0];
}

async function countAsks() {
    const rows = (await harness.sql`
        select count(*)::int as total from asks where server_id = ${serverId}
    `) as { total: number }[];
    return rows[0].total;
}

async function join(client: HausClient, email: string, displayName: string, handle: string) {
    const { token } = await owner.trpc.invitation.create.mutate({ email, serverId });
    await client.trpc.invitation.accept.mutate({ token });
    await client.trpc.member.updateProfile.mutate({
        description: null,
        displayName,
        handle,
        serverId,
    });
}

async function signIn(clerkUserId: string, verifiedEmails: string[]) {
    harness.clerkUsers.setVerifiedEmails(clerkUserId, verifiedEmails);
    return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
}

async function readUserId(clerkUserId: string) {
    const rows = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
