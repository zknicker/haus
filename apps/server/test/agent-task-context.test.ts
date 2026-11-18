import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentInboxItem } from '@haus/api';
import { eq } from 'drizzle-orm';
import { readAgentSessionGeneration } from '../src/agent-delivery/cursors.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxExactVisibilityTable,
    chatMessagesTable,
    chatsTable,
    tasksTable,
    usersTable,
} from '../src/postgres/schema.ts';
import { insertTaskKeyEntry } from '../src/tasks/task-key-ledger.ts';
import { deliverHuman, offlineDelivery, type Seed, seedAgent } from './agent-inbox-harness.ts';
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

test('a Task mention with no visible context carries the origin and the earlier messages', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const task = await addTask(seed, 'Should we cut the release today?');
    const reply = await deliverHuman(connection.db, delivery, seed, {
        chatId: task.chatId,
        content: 'I think the migration is still flaky.',
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: task.chatId,
        content: '@ada can you weigh in?',
        mentioned: true,
    });

    const start = await wake();
    const item = start?.inbox.find((entry) => entry.id === mention);

    expect(start?.drainItemIds).toContain(mention);
    expect(item?.taskContext).toEqual({
        parentMessage: expect.objectContaining({
            chatId: seed.channelId,
            content: 'Should we cut the release today?',
            id: task.parentMessageId,
            senderHandle: seed.humanHandle,
            senderType: 'human',
        }),
        parentTarget: '#product',
        recentMessages: [
            expect.objectContaining({
                chatId: task.chatId,
                content: 'I think the migration is still flaky.',
                id: reply,
            }),
        ],
        suggestedReadTarget: task.target,
        taskTarget: task.target,
        truncated: false,
    });
    // The ordinary reply is not a mention and carries no package of its own.
    expect(start?.inbox.find((entry) => entry.id === reply)?.taskContext).toBeUndefined();
});

test("a human sender's saved zone rides the envelope, never the quoted Task lines", async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const task = await addTask(seed, 'Standup moved?');
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: task.chatId,
        content: '@ada move standup to 9?',
        mentioned: true,
    });
    const zoneless = (await wake())?.inbox.find((entry) => entry.id === mention);
    expect(zoneless?.senderTimezone).toBeUndefined();

    await connection.db
        .update(usersTable)
        .set({ timezone: 'America/Chicago' })
        .where(eq(usersTable.id, seed.userId));
    const zoned = (await wake())?.inbox.find((entry) => entry.id === mention);
    expect(zoned?.senderTimezone).toBe('America/Chicago');
    // Quoted lines stay zoneless: a Computer's strict context schema predates the field.
    expect(zoned?.taskContext?.parentMessage).not.toHaveProperty('senderTimezone');
});

test('a package keeps the newest ten replies and says it left earlier ones out', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const task = await addTask(seed, 'Root');
    for (let index = 1; index <= 12; index += 1) {
        await deliverHuman(connection.db, delivery, seed, {
            chatId: task.chatId,
            content: `reply ${index}`,
        });
    }
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: task.chatId,
        content: '@ada summarize',
        mentioned: true,
    });

    const context = contextOf(await wake(), mention);

    expect(context?.recentMessages.map((message) => message.content)).toEqual(
        Array.from({ length: 10 }, (_, index) => `reply ${index + 3}`)
    );
    expect(context?.truncated).toBe(true);
});

test('a long parent is clipped and long replies stop at the quoted-text budget', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const task = await addTask(seed, 'p'.repeat(5000));
    await deliverHuman(connection.db, delivery, seed, {
        chatId: task.chatId,
        content: 'a'.repeat(1500),
    });
    await deliverHuman(connection.db, delivery, seed, {
        chatId: task.chatId,
        content: 'b'.repeat(1500),
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: task.chatId,
        content: '@ada thoughts?',
        mentioned: true,
    });

    const context = contextOf(await wake(), mention);

    expect(context?.parentMessage.clipped).toBe(true);
    expect(context?.parentMessage.content).toHaveLength(2001);
    // Only the newest reply fits beside a 2,000-character parent.
    expect(context?.recentMessages.map((message) => message.content[0])).toEqual(['b']);
    expect(context?.truncated).toBe(true);
});

test('no package when the Agent already saw the Task this session', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const task = await addTask(seed, 'Root');
    const seen = await deliverHuman(connection.db, delivery, seed, { chatId: task.chatId });
    await connection.db.insert(agentInboxExactVisibilityTable).values({
        agentId: seed.agentId,
        chatId: task.chatId,
        messageId: seen,
        seenAt: new Date(),
        serverId: seed.serverId,
        sessionGeneration: await readAgentSessionGeneration(connection.db, seed.agentId),
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: task.chatId,
        mentioned: true,
    });

    expect(contextOf(await wake(), mention)).toBeUndefined();
});

test('the drain budget reserves a package even though it may be omitted', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const task = await addTask(seed, 'r'.repeat(1900));
    await deliverHuman(connection.db, delivery, seed, {
        chatId: task.chatId,
        content: 'x'.repeat(1900),
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: task.chatId,
        content: '@ada look',
        mentioned: true,
    });
    const dms: string[] = [];
    for (let index = 0; index < 2; index += 1) {
        dms.push(
            await deliverHuman(connection.db, delivery, seed, {
                addressedReason: 'dm',
                chatId: seed.dmChatId,
                content: 'd'.repeat(10_000),
            })
        );
    }

    const start = await wake();

    // Bodies alone total about 20,000 characters; the package pushes the
    // second DM past the 24,000-character drain budget.
    expect(start?.drainItemIds).toEqual([mention, dms[0]]);
});

function contextOf(
    start: { inbox: AgentInboxItem[] } | undefined,
    id: string
): AgentInboxItem['taskContext'] {
    return start?.inbox.find((entry) => entry.id === id)?.taskContext;
}

let parentSequence = 1_000_000;

/** A Task started from a new #product Message, numbered `CTX-1` on its own Server. */
async function addTask(seed: Seed, parentContent: string) {
    const parentMessageId = createOpaqueId('msg');
    parentSequence += 1;
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: seed.userId,
        chatId: seed.channelId,
        content: parentContent,
        id: parentMessageId,
        nonce: createOpaqueId('nonce'),
        sequence: parentSequence,
        serverId: seed.serverId,
    });
    const chatId = createOpaqueId('cht');
    await connection.db.insert(chatsTable).values({
        anchorMessageId: parentMessageId,
        id: chatId,
        kind: 'task',
        parentChatId: seed.channelId,
        parentChatKind: 'channel',
        serverId: seed.serverId,
    });
    const keyId = await insertTaskKeyEntry(connection.db, { key: 'CTX', serverId: seed.serverId });
    await connection.db.insert(tasksTable).values({
        chatId,
        createdByUserId: seed.userId,
        id: createOpaqueId('tsk'),
        keyId,
        number: 1,
        serverId: seed.serverId,
        title: 'Context',
    });
    return { chatId, parentMessageId, target: 'task:CTX-1' };
}
