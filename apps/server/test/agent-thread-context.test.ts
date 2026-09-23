import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentInboxItem } from '@haus/api';
import { readAgentSessionGeneration } from '../src/agent-delivery/cursors.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxExactVisibilityTable,
    chatMessagesTable,
    chatsTable,
} from '../src/postgres/schema.ts';
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

test('a Thread mention with no visible context carries the parent and the earlier replies', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const thread = await addThread(seed, 'Should we cut the release today?');
    const reply = await deliverHuman(connection.db, delivery, seed, {
        chatId: thread.chatId,
        content: 'I think the migration is still flaky.',
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: thread.chatId,
        content: '@ada can you weigh in?',
        mentioned: true,
    });

    const start = await wake();
    const item = start?.inbox.find((entry) => entry.id === mention);

    expect(start?.drainItemIds).toContain(mention);
    expect(item?.threadContext).toEqual({
        parentMessage: expect.objectContaining({
            chatId: seed.channelId,
            content: 'Should we cut the release today?',
            id: thread.parentMessageId,
            senderHandle: seed.humanHandle,
            senderType: 'human',
        }),
        parentTarget: '#product',
        recentMessages: [
            expect.objectContaining({
                chatId: thread.chatId,
                content: 'I think the migration is still flaky.',
                id: reply,
            }),
        ],
        suggestedReadTarget: thread.target,
        threadTarget: thread.target,
        truncated: false,
    });
    // The ordinary reply is not a mention and carries no package of its own.
    expect(start?.inbox.find((entry) => entry.id === reply)?.threadContext).toBeUndefined();
});

test('a package keeps the newest ten replies and says it left earlier ones out', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const thread = await addThread(seed, 'Root');
    for (let index = 1; index <= 12; index += 1) {
        await deliverHuman(connection.db, delivery, seed, {
            chatId: thread.chatId,
            content: `reply ${index}`,
        });
    }
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: thread.chatId,
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
    const thread = await addThread(seed, 'p'.repeat(5000));
    await deliverHuman(connection.db, delivery, seed, {
        chatId: thread.chatId,
        content: 'a'.repeat(1500),
    });
    await deliverHuman(connection.db, delivery, seed, {
        chatId: thread.chatId,
        content: 'b'.repeat(1500),
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: thread.chatId,
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

test('no package when the Agent already saw the Thread this session', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const thread = await addThread(seed, 'Root');
    const seen = await deliverHuman(connection.db, delivery, seed, { chatId: thread.chatId });
    await connection.db.insert(agentInboxExactVisibilityTable).values({
        agentId: seed.agentId,
        chatId: thread.chatId,
        messageId: seen,
        seenAt: new Date(),
        serverId: seed.serverId,
        sessionGeneration: await readAgentSessionGeneration(connection.db, seed.agentId),
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: thread.chatId,
        mentioned: true,
    });

    expect(contextOf(await wake(), mention)).toBeUndefined();
});

test('the drain budget reserves a package even though it may be omitted', async () => {
    const seed = await seedAgent(connection.db);
    const { delivery, wake } = offlineDelivery(connection.db, seed);
    const thread = await addThread(seed, 'r'.repeat(1900));
    await deliverHuman(connection.db, delivery, seed, {
        chatId: thread.chatId,
        content: 'x'.repeat(1900),
    });
    const mention = await deliverHuman(connection.db, delivery, seed, {
        addressedReason: 'mention',
        chatId: thread.chatId,
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
): AgentInboxItem['threadContext'] {
    return start?.inbox.find((entry) => entry.id === id)?.threadContext;
}

let parentSequence = 1_000_000;

async function addThread(seed: Seed, parentContent: string) {
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
        kind: 'thread',
        parentChatId: seed.channelId,
        parentChatKind: 'channel',
        serverId: seed.serverId,
    });
    return { chatId, parentMessageId, target: `#product:${parentMessageId.slice(4, 12)}` };
}
