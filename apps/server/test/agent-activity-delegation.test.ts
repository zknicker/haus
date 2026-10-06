import { afterAll, beforeAll, expect, test } from 'bun:test';
import { agentActivityFrameSchema } from '@haus/api';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { recordComputerAgentActivity } from '../src/server-agents/agent-activity.ts';
import {
    listAgentActivityHistory,
    readActiveAgentActivity,
} from '../src/server-agents/agent-activity-history.ts';
import { activityFrame, seedActivity, startRun } from './agent-activity-fixture.ts';
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

const first = '0123456789abcdef0123456789abcdef';
const second = 'fedcba9876543210fedcba9876543210';

test('the active snapshot lists running sub-agents paired by operation id', async () => {
    const seed = await seedActivity(connection.db);
    const { delivery, frame } = await startRun(connection.db, seed);
    await delivery.onAck({ agentId: seed.agentId, runId: frame.runId });
    let sequence = 0;
    const record = async (
        operationId: string,
        phase: 'completed' | 'started',
        occurredAt = '2026-10-06T12:00:00.000Z'
    ) =>
        await recordComputerAgentActivity(connection.db, {
            computerId: seed.computerId,
            frame: agentActivityFrameSchema.parse({
                ...activityFrame(seed, frame.runId, ++sequence),
                category: 'delegating',
                occurredAt,
                operationId,
                phase,
            }),
            serverId: seed.serverId,
        });

    const started = await record(first, 'started');
    expect(started).toMatchObject({ category: 'delegating', operationId: first });
    await record(second, 'started', '2026-10-06T12:00:05.000Z');
    const both = await readActiveAgentActivity(connection.db, seed.serverId);
    expect(both.activities[0]?.activeDelegations).toEqual([
        { operationId: first, startedAt: '2026-10-06T12:00:00.000Z' },
        { operationId: second, startedAt: '2026-10-06T12:00:05.000Z' },
    ]);

    await record(first, 'completed');
    const one = await readActiveAgentActivity(connection.db, seed.serverId);
    expect(one.activities[0]).toMatchObject({
        activeDelegations: [{ operationId: second }],
        category: 'delegating',
    });

    await record(second, 'completed');
    const none = await readActiveAgentActivity(connection.db, seed.serverId);
    expect(none.activities[0]?.category).toBe('working');
    expect(none.activities[0]).not.toHaveProperty('activeDelegations');

    const history = await listAgentActivityHistory(connection.db, {
        agentId: seed.agentId,
        limit: 50,
        runId: frame.runId,
        serverId: seed.serverId,
    });
    expect(
        history.events
            .filter((event) => event.category === 'delegating')
            .map((event) => `${event.operationId}:${event.phase}`)
    ).toEqual([
        `${second}:completed`,
        `${first}:completed`,
        `${second}:started`,
        `${first}:started`,
    ]);
});
