import { afterAll, beforeAll, expect, test } from 'bun:test';
import { assignAgentTask } from '../src/agent-api/task-assign.ts';
import { claimAgentTasks } from '../src/agent-api/task-claims.ts';
import { createAgentTasks } from '../src/agent-api/task-create.ts';
import { listAgentTasks } from '../src/agent-api/task-list.ts';
import { updateAgentTask } from '../src/agent-api/tasks.ts';
import { advanceSeenCursor } from '../src/agent-delivery/cursors.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { publishRealtime } from '../src/realtime/topic.ts';
import { findMessageTask } from '../src/tasks/task-shape.ts';
import { seedAgentRunner, seedThreadTaskScene } from './agent-thread-task-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';

/**
 * An Agent claims the Thread message it was asked in. The task is numbered and
 * owned by the Thread's parent, sits on the Thread message, and is worked in
 * the Thread it sits in.
 */

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;
let delivery: AgentDelivery;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_thread_tasks'));
    delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('claiming a Thread message makes a Thread task numbered by the parent', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-claim');
    // A top-level task first, so the Thread task proves it draws the parent's sequence.
    await owner.trpc.task.create.mutate({
        chatId: scene.chatId,
        content: 'Top-level work',
        nonce: 'thread-claim:top',
        serverId: scene.serverId,
    });

    const claimed = await claimAgentTasks(connection.db, scene.runner, {
        messageId: scene.replyId.slice(4, 12),
        target: scene.threadTarget,
    });

    expect(claimed.results).toMatchObject([{ number: 2, outcome: 'claimed' }]);
    expect(claimed.results[0]?.task).toMatchObject({
        assignee: { handle: 'piper' },
        message: { chat_id: scene.threadChatId, id: scene.replyId },
        number: 2,
        // The Thread's own address, never `<thread target>:<short id>`.
        target: scene.threadTarget,
    });
    // The event names the Message's Chat, so the App refreshes the Thread's row.
    expect(claimed.events.map(({ delivery: { event } }) => event)).toEqual([
        expect.objectContaining({ chatId: scene.threadChatId, kind: 'created' }),
    ]);
    const [row] = (await harness.sql`
        select chat_id, thread_chat_id, message_chat_id, origin, status from message_tasks
        where server_id = ${scene.serverId} and message_id = ${scene.replyId}
    `) as Record<string, string>[];
    expect(row).toEqual({
        chat_id: scene.chatId,
        message_chat_id: scene.threadChatId,
        origin: 'claimed',
        status: 'in_progress',
        thread_chat_id: scene.threadChatId,
    });
    expect(await findMessageTask(connection.db, scene.serverId, scene.replyId)).toMatchObject({
        chatId: scene.chatId,
        origin: 'claimed',
        threadChatId: scene.threadChatId,
    });
    // The claimant follows the Thread the task sits in.
    const follows = (await harness.sql`
        select thread_chat_id, followed from agent_thread_follows
        where server_id = ${scene.serverId} and agent_id = ${scene.runner.agentId}
    `) as Array<{ followed: boolean; thread_chat_id: string }>;
    expect(follows).toEqual([{ followed: true, thread_chat_id: scene.threadChatId }]);
});

test('a Thread task answers to its number through the Thread target and the parent', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-lookup');
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
    const parentTarget = `#${scene.chatName}`;

    const again = await claimAgentTasks(connection.db, scene.runner, {
        numbers: [number],
        target: parentTarget,
    });
    expect(again.results).toMatchObject([{ number, outcome: 'already_yours' }]);

    // The Agent has read the Thread, so a status change is not held for context.
    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 1,
        serverId: scene.serverId,
    });
    const review = await updateAgentTask(connection.db, scene.runner, {
        number,
        status: 'in_review',
        target: scene.threadTarget,
    });
    expect(review.task).toMatchObject({ number, status: 'in_review' });

    const handed = await assignAgentTask(connection.db, scene.runner, delivery, {
        assignee: '@rook',
        number,
        target: parentTarget,
    });
    expect(handed.task.assignee).toMatchObject({ handle: 'rook' });

    for (const target of [scene.threadTarget, parentTarget]) {
        const listed = await listAgentTasks(connection.db, rook, { target });
        expect(listed.tasks.map((task) => [task.number, task.target])).toEqual([
            [number, scene.threadTarget],
        ]);
    }
});

test('Thread task changes reach a member who can see the parent, keyed to the Thread', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-events');
    const stream = collectStream(owner.trpc.task.onChanged, { serverId: scene.serverId });
    await stream.started;

    const claimed = await claimAgentTasks(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });
    publishRealtime(claimed.events);
    const created = await stream.next((event) => event.messageId === scene.replyId);
    const task = await findMessageTask(connection.db, scene.serverId, scene.replyId);
    await owner.trpc.task.update.mutate({
        expectedVersion: task?.version ?? 0,
        messageId: scene.replyId,
        patch: { priority: 'high' },
        serverId: scene.serverId,
    });
    const updated = await stream.next((event) => event.kind === 'updated');
    stream.stop();

    for (const [event, kind] of [
        [created, 'created'],
        [updated, 'updated'],
    ] as const) {
        expect(event).toEqual({
            chatId: scene.threadChatId,
            kind,
            messageId: scene.replyId,
            serverId: scene.serverId,
        });
    }
});

test('a human still cannot convert a Thread message, even one an Agent claimed', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-human');
    await claimAgentTasks(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });

    await expect(
        owner.trpc.task.promote.mutate({ messageId: scene.replyId, serverId: scene.serverId })
    ).rejects.toThrow(/top-level Channel or DM/i);
});

test('the task list carries a Thread task under its parent with the Thread summary', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-list');
    await claimAgentTasks(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });

    const hidden = await owner.trpc.task.list.query({ serverId: scene.serverId });
    expect(hidden).toMatchObject({ backgroundCount: 1, tasks: [] });
    const listed = await owner.trpc.task.list.query({
        chatId: scene.chatId,
        includeBackground: true,
        serverId: scene.serverId,
    });

    expect(listed.tasks).toHaveLength(1);
    expect(listed.tasks[0]).toMatchObject({
        chatKind: 'channel',
        chatName: scene.chatName,
        message: { chatId: scene.threadChatId, id: scene.replyId },
        task: { chatId: scene.chatId, threadChatId: scene.threadChatId },
        threadSummary: {
            anchorMessageId: scene.anchorId,
            replyCount: 1,
            threadChatId: scene.threadChatId,
        },
    });
});

test('an Agent creating its own task records a claim; a handoff stays composed', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-create');
    await seedAgentRunner(harness, { chatId: scene.chatId, id: scene.serverId }, 'rook');
    const target = `#${scene.chatName}`;

    const mine = await createAgentTasks(
        connection.db,
        scene.runner,
        { assignee: '@piper', nonce: 'create-mine', target, titles: ['Draft the notes'] },
        delivery
    );
    const handoff = await createAgentTasks(
        connection.db,
        scene.runner,
        { assignee: '@rook', nonce: 'create-peer', target, titles: ['Review the notes'] },
        delivery
    );
    const open = await createAgentTasks(
        connection.db,
        scene.runner,
        { nonce: 'create-open', target, titles: ['Publish the notes'] },
        delivery
    );

    // A top-level task keeps its Channel as its target.
    expect(mine.tasks[0]?.target).toBe(target);
    const origins = await Promise.all(
        [mine, handoff, open].map(async (created) => {
            const task = await findMessageTask(
                connection.db,
                scene.serverId,
                created.tasks[0]?.message.id ?? ''
            );
            return { origin: task?.origin, status: task?.status, tier: task?.tier };
        })
    );
    expect(origins).toEqual([
        { origin: 'claimed', status: 'in_progress', tier: 'background' },
        { origin: 'composed', status: 'todo', tier: 'tracked' },
        { origin: 'composed', status: 'todo', tier: 'tracked' },
    ]);
    await expect(
        createAgentTasks(
            connection.db,
            scene.runner,
            { nonce: 'create-thread', target: scene.threadTarget, titles: ['Not here'] },
            delivery
        )
    ).rejects.toThrow('Tasks require a top-level Channel or DM.');
});
