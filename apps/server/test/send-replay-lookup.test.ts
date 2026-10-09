import { afterAll, beforeAll, expect, test } from 'bun:test';
import { inArray } from 'drizzle-orm';
import { readExistingAgentMessage } from '../src/chats/send-agent-message-replay.ts';
import { readExistingChatMessage } from '../src/chats/send-message-replay.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { chatMessagesTable } from '../src/postgres/schema.ts';
import { postMessage, seedReader } from './agent-read-fixture.ts';
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

test('replay finds a send by (serverId, chatId, nonce), never the same nonce in another Chat', async () => {
    const db = connection.db;
    const seed = await seedReader(db);
    const inChannel = await postMessage(db, seed, { chatId: seed.channelId });
    const inDm = await postMessage(db, seed, { agentId: seed.agentId, chatId: seed.dmChatId });
    await db
        .update(chatMessagesTable)
        .set({ nonce: 'nonce_shared' })
        .where(inArray(chatMessagesTable.id, [inChannel.id, inDm.id]));

    const human = await readExistingChatMessage(db, seed.serverId, seed.channelId, 'nonce_shared');
    expect(human).toMatchObject({ chatId: seed.channelId, id: inChannel.id });
    expect(human).not.toHaveProperty('eventCursor');
    expect(
        await readExistingChatMessage(db, seed.serverId, seed.channelId, 'nonce_other')
    ).toBeUndefined();

    const agentInput = {
        agentId: seed.agentId,
        attachmentIds: [],
        chatId: seed.dmChatId,
        nonce: 'nonce_shared',
        serverId: seed.serverId,
    } as unknown as Parameters<typeof readExistingAgentMessage>[1];
    expect(await readExistingAgentMessage(db, agentInput)).toMatchObject({ id: inDm.id });
    expect(
        await readExistingAgentMessage(db, { ...agentInput, chatId: seed.channelId })
    ).toMatchObject({ id: inChannel.id });
    expect(
        await readExistingAgentMessage(db, { ...agentInput, serverId: 'srv_elsewhere' })
    ).toBeUndefined();
});
