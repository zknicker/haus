import { afterAll, beforeAll, expect, test } from 'bun:test';
import { enqueueInboxItem } from '../src/agent-delivery/store.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { seedAgent } from './agent-inbox-harness.ts';
import { startMigratedDatabase, type TestDatabase } from './postgres-cluster.ts';

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

test('0162 makes Issue items chatless and leaves task_assignment no exemption', async () => {
    const seed = await seedAgent(connection.db);
    const item = (source: string, chatId: string | null, dedupeKey: string) =>
        enqueueInboxItem(connection.db, {
            agentId: seed.agentId,
            chatId,
            content: '{}',
            dedupeKey,
            serverId: seed.serverId,
            source,
        });

    await item('issue_assignment', null, 'issue-assign:iss_a:1');
    await item('issue_event', null, 'issue-event:iss_a:icm_1');
    await expect(item('issue_event', seed.channelId, 'issue-event:iss_a:icm_2')).rejects.toThrow();
    await expect(item('task_assignment', null, 'task-assign:tsk_a:1')).rejects.toThrow();
});
