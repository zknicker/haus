import { afterAll, beforeAll, expect, test } from 'bun:test';
import { modelConnectionsUpdatedTopic } from '../src/realtime/topics.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    type ConnectionServer,
    connectionsAnnounced,
    seedConnectionServer,
} from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const hour = 60 * 60 * 1000;
const weekly = [
    {
        id: 'current-session',
        label: '5-hour',
        resetsAt: '2026-11-19T15:00:00.000Z',
        usedPercent: 42,
    },
    { id: 'current-week-all-models', label: 'Weekly', resetsAt: null, usedPercent: 81.6 },
];
let harness: HausServerHarness;
let seed: ConnectionServer;
let runner: RunnerClient;
let planId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'models-capacity');
    planId = (await addClaudeConnection(seed, 'Team plan', 'sk-ant-oat01-team-token')).id;
    runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-model-connections'));
});

afterAll(async () => {
    runner?.close();
    seed?.owner.close();
    await harness?.close();
});

test('a capacity reading is stored and listed on its connection', async () => {
    const announced = connectionsAnnounced(seed.serverId);
    runner.send(capacity(planId, new Date(), weekly));
    await announced;

    expect(await listedCapacity(planId)).toEqual(weekly);
});

test('an unchanged reading is stored without an announcement', async () => {
    const log = announcementLog(seed.serverId);
    const readAt = new Date();
    runner.send(capacity(planId, readAt, weekly));
    const changed = [{ ...weekly[0], usedPercent: 43 }, weekly[1]];
    runner.send(capacity(planId, new Date(readAt.getTime() + 1), changed));
    await log.first;

    expect(await listedCapacity(planId)).toEqual(changed);
    expect(log.count()).toBe(1);
    log.stop();
});

test('a reading older than 6 hours lists as null', async () => {
    const stale = (await addClaudeConnection(seed, 'Old plan', 'sk-ant-oat01-old-token')).id;
    const announced = connectionsAnnounced(seed.serverId);
    runner.send(capacity(stale, new Date(Date.now() - 7 * hour), weekly));
    await announced;

    expect(await listedCapacity(stale)).toBeNull();
    const [row] = await harness.sql`select capacity from model_connections where id = ${stale}`;
    expect(row?.capacity).toEqual(weekly);
});

test('a replaced credential clears the capacity', async () => {
    expect(await listedCapacity(planId)).not.toBeNull();

    const replaced = await seed.owner.trpc.modelConnections.replaceCredential.mutate({
        connectionId: planId,
        credential: { kind: 'setup-token', token: 'sk-ant-oat01-team-renewed' },
        serverId: seed.serverId,
    });

    expect(replaced.capacity).toBeNull();
    const [row] = await harness.sql`
        select capacity, capacity_read_at from model_connections where id = ${planId}
    `;
    expect(row).toEqual({ capacity: null, capacity_read_at: null });
});

function capacity(connectionId: string, readAt: Date, windows: unknown[]) {
    return {
        connectionId,
        readAt: readAt.toISOString(),
        type: 'runner-connection-capacity',
        windows,
    };
}

async function listedCapacity(connectionId: string) {
    const { connections } = await seed.owner.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    return connections.find((connection) => connection.id === connectionId)?.capacity;
}

function announcementLog(serverId: string) {
    const controller = new AbortController();
    let count = 0;
    let markFirst: () => void = () => undefined;
    const first = new Promise<void>((resolve) => {
        markFirst = resolve;
    });
    const deliveries = modelConnectionsUpdatedTopic.subscribe(controller.signal);
    (async () => {
        for await (const delivery of deliveries) {
            if (delivery.event.serverId === serverId) {
                count += 1;
                markFirst();
            }
        }
    })().catch(() => undefined);
    return { count: () => count, first, stop: () => controller.abort() };
}
