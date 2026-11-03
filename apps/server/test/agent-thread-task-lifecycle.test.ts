import { afterAll, beforeAll, expect, test } from 'bun:test';
import { claimAgentTasks } from '../src/agent-api/task-claims.ts';
import { updateAgentTask } from '../src/agent-api/tasks.ts';
import { advanceSeenCursor } from '../src/agent-delivery/cursors.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { closeStaleInReviewTasks } from '../src/tasks/close-stale-tasks.ts';
import {
    seedThreadTaskScene,
    sendThreadReply,
    type ThreadTaskScene,
} from './agent-thread-task-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * A Thread task's work surface is the Thread it sits in, not a Thread anchored
 * on its own message (Threads never nest): context freshness and stale-review
 * activity both read the containing Thread.
 */

let harness: HausServerHarness;
let owner: HausClient;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_thread_life'));
});

afterAll(async () => {
    owner.close();
    await connection?.close();
    await harness.close();
});

test('new context in the containing Thread holds a status change until the Agent checks', async () => {
    const scene = await seedThreadTaskScene(harness, owner, 'thread-fresh');
    const number = await claimThreadTask(scene);
    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 1,
        serverId: scene.serverId,
    });
    await sendThreadReply(owner, {
        anchorId: scene.anchorId,
        chatId: scene.chatId,
        content: 'Actually, include the migration notes too.',
        nonce: 'thread-fresh:later',
        serverId: scene.serverId,
    });

    await expect(
        updateAgentTask(connection.db, scene.runner, {
            number,
            status: 'in_review',
            target: scene.threadTarget,
        })
    ).rejects.toThrow('New context exists in this task thread.');

    await advanceSeenCursor(connection.db, {
        agentId: scene.runner.agentId,
        chatId: scene.threadChatId,
        sequence: 2,
        serverId: scene.serverId,
    });
    const review = await updateAgentTask(connection.db, scene.runner, {
        number,
        status: 'in_review',
        target: scene.threadTarget,
    });
    expect(review.task).toMatchObject({ number, status: 'in_review' });
});

test('activity in the containing Thread keeps an in_review Thread task open', async () => {
    const quiet = await seedThreadTaskScene(harness, owner, 'thread-stale-quiet');
    const busy = await seedThreadTaskScene(harness, owner, 'thread-stale-busy');
    for (const scene of [quiet, busy]) {
        await claimThreadTask(scene);
        await backdateIntoReview(scene);
    }
    await sendThreadReply(owner, {
        anchorId: busy.anchorId,
        chatId: busy.chatId,
        content: 'Still reviewing this one.',
        nonce: 'thread-stale-busy:recent',
        serverId: busy.serverId,
    });

    const events = await closeStaleInReviewTasks(connection.db, new Date());

    const closed = events.map(({ delivery }) => delivery.event.messageId);
    expect(closed).toContain(quiet.replyId);
    expect(closed).not.toContain(busy.replyId);
    const rows = (await harness.sql`
        select message_id, status from message_tasks
        where message_id in (${quiet.replyId}, ${busy.replyId})
        order by message_id = ${busy.replyId}
    `) as Array<{ message_id: string; status: string }>;
    expect(rows).toEqual([
        { message_id: quiet.replyId, status: 'closed' },
        { message_id: busy.replyId, status: 'in_review' },
    ]);
});

async function claimThreadTask(scene: ThreadTaskScene) {
    const claimed = await claimAgentTasks(connection.db, scene.runner, {
        messageId: scene.replyId,
        target: scene.threadTarget,
    });
    return claimed.results[0]?.number ?? 0;
}

/** Puts the task in review and everything it has seen ten days back. */
async function backdateIntoReview(scene: ThreadTaskScene) {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await harness.sql`
        update message_tasks set status = 'in_review', updated_at = ${tenDaysAgo}
        where server_id = ${scene.serverId} and message_id = ${scene.replyId}
    `;
    await harness.sql`
        update chat_messages set created_at = ${tenDaysAgo}
        where server_id = ${scene.serverId}
    `;
}
