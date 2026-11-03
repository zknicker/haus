import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { assertFreshAgentView } from '../src/agent-api/chat-freshness.ts';
import { readAgentHistory } from '../src/agent-api/message-history.ts';
import { type AgentSendModeInput, prepareAgentSend } from '../src/agent-api/send-hold.ts';
import { readAgentInboxCursor } from '../src/agent-delivery/cursors.ts';
import { joinChannelAgents } from '../src/chats/channel-agent-membership.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentInboxExactVisibilityTable, agentInboxTable } from '../src/postgres/schema.ts';
import { seedAgent } from './agent-inbox-harness.ts';
import { addThread, postMessage, readerRunner, seedReader } from './agent-read-fixture.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('history from before an Agent joined never holds its first send', async () => {
    const db = connection.db;
    const seed = await seedAgent(db);
    for (let index = 0; index < 72; index += 1) {
        await postMessage(db, seed, { chatId: seed.channelId, content: `Old ${index}` });
    }
    await joinChannelAgents(db, {
        agentIds: [seed.agentId],
        chatId: seed.channelId,
        serverId: seed.serverId,
    });
    const runner = readerRunner(seed, 'run_new_agent');

    const unread = await readAgentHistory(db, runner, {
        limit: 50,
        target: '#product',
        unread: true,
    });
    expect(unread.messages).toEqual([]);
    expect(await send(runner, seed.channelId, 'Hello, I just joined.')).toMatchObject({
        kind: 'send',
    });
    await expect(assertFreshAgentView(db, runner, seed.channelId)).resolves.toBeUndefined();
});

test('a delivered message the Agent has not seen holds once; undelivered chatter never does', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const runner = readerRunner(seed, 'run_delivered_hold');
    await postMessage(db, seed, { chatId: seed.channelId, content: 'Not routed to this Agent.' });
    const delivered = await postMessage(db, seed, {
        chatId: seed.channelId,
        content: 'Please wait, the plan changed.',
        recipient: true,
    });

    await expect(assertFreshAgentView(db, runner, seed.channelId)).rejects.toMatchObject({
        code: 'CHAT_VIEW_STALE',
    });
    const held = await send(runner, seed.channelId, 'Shipping the old plan.');
    expect(held).toMatchObject({
        kind: 'held',
        response: { newMessageCount: 1, omittedMessageCount: 0 },
    });
    expect(shownIds(held)).toEqual([delivered.id]);

    expect(await send(runner, seed.channelId, 'Revised for the new plan.')).toMatchObject({
        kind: 'send',
    });
});

test('a Thread holds for every unseen reply, delivered or not, as Raft counts it', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const anchor = await postMessage(db, seed, { chatId: seed.channelId });
    const threadId = await addThread(db, seed, {
        anchorId: anchor.id,
        followed: true,
        parentChatId: seed.channelId,
    });
    const reply = await postMessage(db, seed, { chatId: threadId, content: 'Earlier reply.' });
    const runner = readerRunner(seed, 'run_thread_hold');

    const held = await send(runner, threadId, 'Joining the Thread.');
    expect(held).toMatchObject({ kind: 'held', response: { newMessageCount: 1 } });
    expect(shownIds(held)).toEqual([reply.id]);
    expect(await send(runner, threadId, 'Joining the Thread.')).toMatchObject({ kind: 'send' });

    const newer = await postMessage(db, seed, { chatId: threadId, content: 'Newer reply.' });
    const reheld = await send(runner, threadId, 'Joining the Thread.');
    expect(shownIds(reheld)).toEqual([newer.id]);
});

test('a hold shows the latest three and does not walk back through the ones it omitted', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const runner = readerRunner(seed, 'run_hold_window');
    const posted: string[] = [];
    for (let index = 0; index < 5; index += 1) {
        posted.push(
            (
                await postMessage(db, seed, {
                    chatId: seed.channelId,
                    content: `Update ${index}`,
                    recipient: true,
                })
            ).id
        );
    }

    const held = await send(runner, seed.channelId, 'Status report.');
    expect(held).toMatchObject({
        kind: 'held',
        response: { newMessageCount: 5, omittedMessageCount: 2 },
    });
    expect(shownIds(held)).toEqual(posted.slice(2));
    expect(await sendDraft(runner, seed.channelId)).toMatchObject({ kind: 'send' });

    // The omitted two are never marked visible and stay ahead of the seen
    // boundary, so ordinary delivery still brings them.
    const visible = await db
        .select({ messageId: agentInboxExactVisibilityTable.messageId })
        .from(agentInboxExactVisibilityTable)
        .where(eq(agentInboxExactVisibilityTable.agentId, seed.agentId));
    expect(visible.map((row) => row.messageId).sort()).toEqual(posted.slice(2).sort());
    const queued = await db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(and(eq(agentInboxTable.agentId, seed.agentId), eq(agentInboxTable.state, 'queued')));
    expect(queued.map((row) => row.dedupeKey).sort()).toEqual([...posted].sort());
    expect(await readAgentInboxCursor(db, { ...runner, chatId: seed.channelId })).toMatchObject({
        heldThrough: 5,
        seen: 0,
    });
});

test('--anyway is suggested and allowed from a draft’s fourth hold, as in Raft', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const runner = readerRunner(seed, 'run_hold_anyway');
    const holds: unknown[] = [];
    for (let index = 0; index < 4; index += 1) {
        await postMessage(db, seed, {
            chatId: seed.channelId,
            content: `Busy channel ${index}`,
            recipient: true,
        });
        if (index === 3) {
            await expect(
                send(runner, seed.channelId, undefined, { continueAnyway: true })
            ).rejects.toMatchObject({ code: 'SEND_ANYWAY_NOT_ELIGIBLE' });
        }
        holds.push(
            index === 0
                ? await send(runner, seed.channelId, 'Draft reply.')
                : await sendDraft(runner, seed.channelId)
        );
    }

    expect(
        holds.map((hold) => (hold as { response: { continueAnywaySuggested: boolean } }).response)
    ).toMatchObject([
        { continueAnywaySuggested: false, reholdCount: 1 },
        { continueAnywaySuggested: false, reholdCount: 2 },
        { continueAnywaySuggested: false, reholdCount: 3 },
        { continueAnywaySuggested: true, reholdCount: 4 },
    ]);
    await postMessage(db, seed, { chatId: seed.channelId, content: 'Still busy', recipient: true });
    expect(await send(runner, seed.channelId, undefined, { continueAnyway: true })).toMatchObject({
        kind: 'send',
        outgoing: { content: 'Draft reply.' },
    });
});

let nonce = 0;

async function send(
    runner: ResolvedRunner,
    chatId: string,
    content: string | undefined,
    overrides: Partial<AgentSendModeInput> = {}
) {
    nonce += 1;
    return await prepareAgentSend(connection.db, runner, chatId, {
        attachmentIds: [],
        continueAnyway: false,
        nonce: `send_hold_${nonce}`,
        sendDraft: overrides.continueAnyway === true,
        ...(content === undefined ? {} : { content }),
        ...overrides,
    });
}

async function sendDraft(runner: ResolvedRunner, chatId: string) {
    return await send(runner, chatId, undefined, { sendDraft: true });
}

function shownIds(result: Awaited<ReturnType<typeof prepareAgentSend>>) {
    if (result.kind !== 'held') {
        throw new Error('Expected a held send.');
    }
    return result.response.shownMessages.map((message) => message.id);
}
