import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { closeStaleInReviewTasks } from '../src/tasks/close-stale-tasks.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Review that went quiet for `TASK_IN_REVIEW_STALE_DAYS` is closed by Server
 * through the ordinary update path, so App caches invalidate on the same
 * `task.updated` event a human's change emits.
 */

let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

const sweptAt = new Date('2026-09-04T12:00:00.000Z');

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_stale_tasks'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Stale Review Server',
        slug: 'stale-review-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('closes an in_review task whose Thread has been quiet for eight days', async () => {
    const task = await createTask('Ship the retention sweep', 'stale-quiet', 'in_review');
    await backdate(task.messageId, daysBeforeSweep(8));

    const events = await closeStaleInReviewTasks(connection.db, sweptAt);

    expect(events.map(({ messageId, type }) => ({ messageId, type }))).toEqual([
        { messageId: task.messageId, type: 'task.updated' },
    ]);
    const closed = await readTask(task.messageId);
    expect(closed).toMatchObject({ status: 'closed', version: task.version + 1 });
    const delivered = await owner.trpc.chat.events.query({
        afterCursor: task.eventCursor,
        serverId,
    });
    expect(delivered).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ messageId: task.messageId, type: 'task.updated' }),
        ])
    );
});

test('keeps an in_review task whose Thread was answered two days ago', async () => {
    const task = await createTask('Review the migration', 'stale-answered', 'in_review');
    await backdate(task.messageId, daysBeforeSweep(9));
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Still looking at this.',
        nonce: 'stale-answered-reply',
        serverId,
        thread: { anchorMessageId: task.messageId },
    });
    await harness.sql`
        update chat_messages set created_at = ${daysBeforeSweep(2)}
        where nonce = 'stale-answered-reply' and server_id = ${serverId}
    `;

    const events = await closeStaleInReviewTasks(connection.db, sweptAt);

    expect(events.map((event) => event.messageId)).not.toContain(task.messageId);
    expect(await readTask(task.messageId)).toMatchObject({
        status: 'in_review',
        version: task.version,
    });
});

test('a recent inline follow-up keeps review open while unrelated channel activity does not', async () => {
    const active = await createTask('Review the reply flow', 'inline-active', 'in_review');
    const quiet = await createTask('Review an unrelated change', 'inline-quiet', 'in_review');
    await backdate(active.messageId, daysBeforeSweep(9));
    await backdate(quiet.messageId, daysBeforeSweep(9));
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'I have one follow-up on this review.',
        nonce: 'inline-review-followup',
        replyToMessageId: active.messageId,
        serverId,
    });
    await harness.sql`
        update chat_messages set created_at = ${daysBeforeSweep(2)}
        where nonce = 'inline-review-followup' and server_id = ${serverId}
    `;

    const events = await closeStaleInReviewTasks(connection.db, sweptAt);
    expect(events.map((event) => event.messageId)).not.toContain(active.messageId);
    expect(await readTask(active.messageId)).toMatchObject({ status: 'in_review' });
    expect(await readTask(quiet.messageId)).toMatchObject({ status: 'closed' });
});

test('leaves an in_progress task alone however long it has been quiet', async () => {
    const task = await createTask('Long-running migration', 'stale-in-progress', 'in_progress');
    await backdate(task.messageId, daysBeforeSweep(30));

    const events = await closeStaleInReviewTasks(connection.db, sweptAt);

    expect(events.map((event) => event.messageId)).not.toContain(task.messageId);
    expect(await readTask(task.messageId)).toMatchObject({
        status: 'in_progress',
        version: task.version,
    });
});

async function createTask(content: string, nonce: string, status: 'in_progress' | 'in_review') {
    const created = await owner.trpc.task.create.mutate({ chatId, content, nonce, serverId });
    const updated = await owner.trpc.task.update.mutate({
        expectedVersion: created.task.version,
        messageId: created.task.messageId,
        patch: { status },
        serverId,
    });
    return {
        eventCursor: updated.eventCursor ?? '0',
        messageId: updated.task.messageId,
        version: updated.task.version,
    };
}

/** Ages the task row and every message already in its Thread. */
async function backdate(messageId: string, quietSince: Date) {
    await harness.sql`
        update message_tasks set updated_at = ${quietSince}
        where server_id = ${serverId} and message_id = ${messageId}
    `;
    await harness.sql`
        update chat_messages set created_at = ${quietSince}
        where server_id = ${serverId}
          and chat_id in (
            select id from chats
            where server_id = ${serverId} and kind = 'thread' and anchor_message_id = ${messageId}
          )
    `;
}

async function readTask(messageId: string) {
    const [row] = (await harness.sql`
        select status, version from message_tasks
        where server_id = ${serverId} and message_id = ${messageId}
    `) as { status: string; version: number }[];
    return row;
}

function daysBeforeSweep(days: number) {
    return new Date(sweptAt.getTime() - days * 24 * 60 * 60 * 1000);
}
