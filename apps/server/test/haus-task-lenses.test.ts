import { afterAll, beforeAll, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { type AgentTaskError, claimAgentTasks } from '../src/agent-api/tasks.ts';
import type { ResolvedRunner } from '../src/computers/runner-credentials.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { messageTasksTable } from '../src/postgres/schema.ts';
import { buildTaskClaimConflict } from '../src/tasks/claim-conflict.ts';
import { ensureThreadRecord } from '../src/threads/ensure-thread.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_lens_owner'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('promotion leaves the Thread unmaterialized until the first reply', async () => {
    const server = await createServer('lens-promote');
    const anchor = await sendMessage(server, 'Audit the Server export');
    const promoted = await owner.trpc.task.promote.mutate({
        messageId: anchor,
        serverId: server.id,
    });
    const threadChatId = promoted.task.threadChatId;

    expect(await countChats(server.id, threadChatId)).toBe(0);

    await owner.trpc.chat.send.mutate({
        chatId: server.chatId,
        content: 'Starting on it.',
        nonce: 'lens-first-reply',
        serverId: server.id,
        thread: { anchorMessageId: anchor },
    });

    expect(await countChats(server.id, threadChatId)).toBe(1);
    const { tasks } = await owner.trpc.task.list.query({ serverId: server.id });
    expect(tasks[0]?.threadSummary).toMatchObject({ replyCount: 1, threadChatId });
});

test('a task with no Thread still resolves its deep link and reads as empty', async () => {
    const server = await createServer('lens-deeplink');
    const anchor = await sendMessage(server, 'Rotate the release token');
    const promoted = await owner.trpc.task.promote.mutate({
        messageId: anchor,
        serverId: server.id,
    });
    const threadChatId = promoted.task.threadChatId;

    expect(await owner.trpc.thread.get.query({ serverId: server.id, threadChatId })).toMatchObject({
        anchorMessageId: anchor,
        parentChatId: server.chatId,
        threadChatId,
    });
    expect(
        await owner.trpc.chat.messages.query({
            chatId: threadChatId,
            limit: 50,
            serverId: server.id,
        })
    ).toMatchObject({ messages: [], nextBeforeSequence: null });
    const { tasks } = await owner.trpc.task.list.query({ serverId: server.id });
    expect(tasks[0]?.threadSummary).toMatchObject({
        followed: false,
        latestReplyAt: null,
        replyCount: 0,
        threadChatId,
        unreadCount: 0,
    });
});

test('the default lens hides background claims and counts them', async () => {
    const server = await createServer('lens-background');
    const tracked = await sendMessage(server, 'Ship the release notes');
    await owner.trpc.task.promote.mutate({ messageId: tracked, serverId: server.id });
    const claimed = await sendMessage(server, 'Check the flaky delivery test');
    await seedAgentClaim(server, claimed);

    const narrow = await owner.trpc.task.list.query({ serverId: server.id });
    expect(narrow.backgroundCount).toBe(1);
    expect(narrow.tasks.map((item) => item.task.messageId)).toEqual([tracked]);

    const wide = await owner.trpc.task.list.query({
        includeBackground: true,
        serverId: server.id,
    });
    expect(wide.backgroundCount).toBe(0);
    expect(wide.tasks.map((item) => item.task).map((task) => [task.origin, task.tier])).toEqual([
        ['claimed', 'background'],
        ['converted', 'tracked'],
    ]);
});

test("the claimant's own Thread reply leaves it in the background lens", async () => {
    const server = await createServer('lens-promotes');
    const claimed = await sendMessage(server, 'Trace the reconnect path');
    const agentId = await seedAgentClaim(server, claimed);

    await replyInThreadAsAgent(server, claimed, agentId);

    const listed = await owner.trpc.task.list.query({ serverId: server.id });
    expect(listed.backgroundCount).toBe(1);
    expect(listed.tasks).toEqual([]);
});

// Everyone else's chatter is the thing a Thread is for. A background claim is
// the claimant's own bookkeeping, so only the claimant working there moves it
// onto a person's lens.
test('somebody else replying in the Thread leaves the claim in the background lens', async () => {
    const server = await createServer('lens-chatter');
    const claimed = await sendMessage(server, 'Trace the reconnect timeout');
    await seedAgentClaim(server, claimed);

    await owner.trpc.chat.send.mutate({
        chatId: server.chatId,
        content: 'What did you find?',
        nonce: 'lens-thread-question',
        serverId: server.id,
        thread: { anchorMessageId: claimed },
    });

    const listed = await owner.trpc.task.list.query({ serverId: server.id });
    expect(listed.backgroundCount).toBe(1);
    expect(listed.tasks).toEqual([]);
});

test('a lost claim reports the holder, the lock, and what it does not block', async () => {
    const server = await createServer('lens-conflict');
    const claimed = await sendMessage(server, 'Rebuild the search index');
    await seedAgentClaim(server, claimed);
    const [task] = await connection.db
        .select()
        .from(messageTasksTable)
        .where(
            and(eq(messageTasksTable.serverId, server.id), eq(messageTasksTable.messageId, claimed))
        );

    const conflict = await buildTaskClaimConflict(
        connection.db,
        server.id,
        task,
        new Date('2026-09-08T00:00:00.000Z')
    );

    expect(conflict).toMatchObject({
        blockedActions: ['start_conflicting_execution'],
        conflictScope: 'implementation_execution',
        currentAssignee: { name: 'sage', type: 'agent' },
        kind: 'claim_conflict',
        observedAt: '2026-09-08T00:00:00.000Z',
        status: 'in_progress',
    });
    expect(conflict.unblockedActionExamples.length).toBeGreaterThan(0);
});

async function createServer(slug: string) {
    const server = await owner.trpc.server.create.mutate({ displayName: slug, slug });
    return {
        chatId: server.channels[0].id,
        chatName: server.channels[0].name ?? '',
        id: server.id,
    };
}

/** An Agent in the Server's first Channel, with a runner authority to act as. */
async function seedAgentRunner(
    server: { chatId: string; id: string },
    handle: string
): Promise<ResolvedRunner> {
    const agentId = `agt_${handle}${server.id.slice(4, 12)}`;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${server.id}, ${handle}, ${handle}, 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${server.id}, ${server.chatId}, ${agentId})
    `;
    return {
        agentId,
        capabilities: [],
        chatId: server.chatId,
        computerId: `cmp_${handle}`,
        runId: `run_${handle}`,
        runnerId: `rnr_${handle}`,
        serverId: server.id,
    };
}

test('the loser of a claim race learns who holds the lock, not to refresh', async () => {
    // Both Agents read the task before either wrote it, so the losing claim
    // fails on a stale version. That is the real race, and it is exactly the
    // refusal Raft parity wants carrying the structured conflict.
    const server = await createServer('lens-race');
    const anchor = await sendMessage(server, 'Cut the release branch');
    await owner.trpc.task.promote.mutate({ messageId: anchor, serverId: server.id });
    const target = `#${server.chatName}`;
    const [first, second] = await Promise.all([
        seedAgentRunner(server, 'ada'),
        seedAgentRunner(server, 'rook'),
    ]);

    const races = await Promise.allSettled([
        claimAgentTasks(connection.db, first, { numbers: [1], target }),
        claimAgentTasks(connection.db, second, { numbers: [1], target }),
    ]);

    expect(races.filter((race) => race.status === 'fulfilled')).toHaveLength(1);
    const lost = races.find((race) => race.status === 'rejected') as PromiseRejectedResult;
    const refusal = lost.reason as AgentTaskError;
    expect(refusal.claimConflict).toMatchObject({
        blockedActions: ['start_conflicting_execution'],
        currentAssignee: { type: 'agent' },
        kind: 'claim_conflict',
        status: 'in_progress',
    });
});

async function sendMessage(server: { chatId: string; id: string }, content: string) {
    const sent = await owner.trpc.chat.send.mutate({
        chatId: server.chatId,
        content,
        nonce: `${server.id}:${content}`,
        serverId: server.id,
    });
    return sent.message.id;
}

/** The exact row `haus task claim <messageId>` writes, without a Computer. */
async function seedAgentClaim(
    server: { chatId: string; id: string },
    messageId: string
): Promise<string> {
    const [agent] = (await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (
            ${`agt_${messageId.slice(4)}`}, ${server.id}, 'sage', 'Sage', 'UTC'
        )
        returning id
    `) as Array<{ id: string }>;
    await harness.sql`
        insert into message_tasks (
            server_id, chat_id, message_id, number, origin, status,
            assignee_agent_id, created_by_agent_id, claimed_at
        )
        values (
            ${server.id}, ${server.chatId}, ${messageId},
            (select last_task_number + 1 from chats where server_id = ${server.id} and id = ${server.chatId}),
            'claimed', 'in_progress', ${agent.id}, ${agent.id}, now()
        )
    `;
    await harness.sql`
        update chats set last_task_number = last_task_number + 1
        where server_id = ${server.id} and id = ${server.chatId}
    `;
    return agent.id;
}

/** The claimant answering in its own Task Thread, materializing the Thread as it goes. */
async function replyInThreadAsAgent(
    server: { chatId: string; id: string },
    anchorMessageId: string,
    agentId: string
) {
    const thread = await ensureThreadRecord(connection.db, {
        anchorMessageId,
        parentChatId: server.chatId,
        serverId: server.id,
    });
    await harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, author_agent_id, content, nonce, sequence, session_generation
        )
        values (
            ${`msg_${anchorMessageId.slice(4)}reply`}, ${server.id}, ${thread.id},
            ${agentId}, 'Traced it; the reconnect path holds.',
            ${`non_${anchorMessageId.slice(4)}`}, 1, 1
        )
    `;
}

async function countChats(serverId: string, chatId: string) {
    const rows = (await harness.sql`
        select id from chats where server_id = ${serverId} and id = ${chatId}
    `) as Array<{ id: string }>;
    return rows.length;
}
