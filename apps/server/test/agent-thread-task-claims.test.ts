import { afterAll, beforeAll, expect, test } from 'bun:test';
import { unfollowAgentThread } from '../src/agent-api/attention.ts';
import { assignAgentTask } from '../src/agent-api/task-assign.ts';
import { claimAgentTasks } from '../src/agent-api/task-claims.ts';
import { advanceSeenCursor } from '../src/agent-delivery/cursors.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { seedAgentRunner, seedThreadTaskScene } from './agent-thread-task-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Claims addressed through a Thread target: the Thread's anchor stays a
 * top-level task, a re-confirmed claim keeps the Agent's Thread follow
 * choice, and a handoff names the Thread the task sits in.
 */

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let delivery: AgentDelivery;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_thread_claims'));
    delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('claiming the Thread anchor through the Thread target makes a top-level task', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'anchor-claim');
    const input = { messageId: scene.anchorId.slice(4, 12), target: scene.threadTarget };

    const claimed = await claimAgentTasks(connection.db, scene.runner, input);

    expect(claimed.results).toMatchObject([{ number: 1, outcome: 'claimed' }]);
    expect(claimed.results[0]?.task).toMatchObject({
        message: { chat_id: scene.chatId, id: scene.anchorId },
        target: `#${scene.chatName}`,
    });
    // An already-promoted anchor resolves to its task instead of promoting again.
    const again = await claimAgentTasks(connection.db, scene.runner, input);
    expect(again.results).toMatchObject([{ number: 1, outcome: 'already_yours' }]);
    const rows = (await harness.sql`
        select chat_id, thread_chat_id from message_tasks
        where server_id = ${scene.serverId}
    `) as Array<{ chat_id: string; thread_chat_id: null | string }>;
    expect(rows).toEqual([{ chat_id: scene.chatId, thread_chat_id: null }]);
});

test('re-confirming a Thread task claim keeps an explicit Thread unfollow', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'unfollow-reclaim');
    const input = { messageId: scene.replyId, target: scene.threadTarget };
    await claimAgentTasks(connection.db, scene.runner, input);
    await unfollowAgentThread(connection.db, scene.runner, scene.threadTarget);

    const again = await claimAgentTasks(connection.db, scene.runner, input);

    expect(again.results).toMatchObject([{ outcome: 'already_yours' }]);
    const follows = (await harness.sql`
        select followed from agent_thread_follows
        where server_id = ${scene.serverId} and agent_id = ${scene.runner.agentId}
          and thread_chat_id = ${scene.threadChatId}
    `) as Array<{ followed: boolean }>;
    expect(follows).toEqual([{ followed: false }]);
});

test('a Thread task handoff names the Thread the task sits in', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-handoff');
    const rook = await seedAgentRunner(
        harness,
        { chatId: scene.chatId, id: scene.serverId },
        'rook'
    );
    const [claim] = (
        await claimAgentTasks(connection.db, scene.runner, {
            messageId: scene.replyId,
            target: scene.threadTarget,
        })
    ).results;
    const number = claim?.number ?? 0;
    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 1,
        serverId: scene.serverId,
    });

    await assignAgentTask(connection.db, scene.runner, delivery, {
        assignee: '@rook',
        number,
        target: `#${scene.chatName}`,
    });

    const handoffs = (await harness.sql`
        select content from agent_inbox
        where server_id = ${scene.serverId} and agent_id = ${rook.agentId}
          and source = 'task_assignment'
    `) as Array<{ content: string }>;
    expect(handoffs.map((handoff) => handoff.content)).toEqual([
        `[Haus task assignment task=#${number} target=${scene.threadTarget} assignedBy=@piper] Can you draft the release notes?`,
    ]);
});
