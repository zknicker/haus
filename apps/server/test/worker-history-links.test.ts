import { afterAll, beforeAll, expect, test } from 'bun:test';
import { resolveWorkerLinks } from '../src/chats/worker-links.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    chatMessagesTable,
    workerHistoryLinksTable,
    workersTable,
} from '../src/postgres/schema.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';
import { seedWorkerBoard, startOn } from './worker-board.fixture.ts';

let cluster: TestDatabase;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startMigratedDatabase();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

test('a Message keeps links only to read-only history it can see; a Task Worker link becomes its label', async () => {
    const board = await seedWorkerBoard(connection.db);
    const { worker } = (await startOn(connection.db, board)).receipt;
    const historyId = createOpaqueId('caw');
    await connection.db.insert(workersTable).values({
        agentId: board.seed.agentId,
        carrierComputerId: board.seed.computerId,
        closedAt: new Date(),
        id: historyId,
        place: 'cursor',
        repository: 'haus/haus',
        serverId: board.seed.serverId,
        title: 'Before Tasks',
    });
    const messageId = createOpaqueId('msg');
    await connection.db.insert(chatMessagesTable).values({
        authorUserId: board.seed.userId,
        chatId: board.seed.channelId,
        content: `[Old](worker://${historyId})`,
        id: messageId,
        nonce: messageId,
        sequence: 99,
        serverId: board.seed.serverId,
    });
    await connection.db.insert(workerHistoryLinksTable).values({
        chatId: board.seed.channelId,
        messageId,
        ordinal: 0,
        serverId: board.seed.serverId,
        workerId: historyId,
    });

    const resolved = await resolveWorkerLinks(connection.db, {
        author: { kind: 'user', userId: board.seed.userId },
        content: `[Old](worker://${historyId}) and [New](worker://${worker.id})`,
        serverId: board.seed.serverId,
    });

    expect(resolved).toEqual({
        content: `[Old](worker://${historyId}) and New`,
        links: [{ ordinal: 0, workerId: historyId }],
    });
});
