import { afterAll, beforeAll, expect, test } from 'bun:test';
import { heartbeatReportDedupeKey } from '../src/agent-delivery/heartbeat-keys.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentInboxTable } from '../src/postgres/schema.ts';
import { resolveAgentTurnTriggers } from '../src/server-agents/agent-turn-trigger-previews.ts';
import { seedAgent } from './agent-inbox-harness.ts';
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

test('a page of heartbeats learns which sent a report in one lookup', async () => {
    const seed = await seedAgent(connection.db);
    await connection.db.insert(agentInboxTable).values({
        agentId: seed.agentId,
        chatId: null,
        content: 'Q4 budget is stuck on legal.',
        dedupeKey: heartbeatReportDedupeKey('run_reported'),
        id: createOpaqueId('inb'),
        serverId: seed.serverId,
        source: 'heartbeat_report',
    });
    const record = (runId: string) => ({
        chatId: null,
        runId,
        source: 'heartbeat',
        visible: false,
        workId: `heartbeat:${runId}`,
    });
    expect(
        await resolveAgentTurnTriggers(connection.db, seed.serverId, [
            record('run_reported'),
            record('run_quiet'),
            null,
        ])
    ).toEqual([
        { kind: 'heartbeat', reported: true },
        { kind: 'heartbeat', reported: false },
        null,
    ]);
});
