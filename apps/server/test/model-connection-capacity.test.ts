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
        resetsAt: new Date(Date.now() + 4 * hour).toISOString(),
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
    runner.send(capacity(stale, new Date(Date.now() - 7 * hour), weekly));
    await framesProcessed();

    expect(await listedCapacity(stale)).toBeNull();
    const [row] = await harness.sql`select capacity from model_connections where id = ${stale}`;
    expect(row?.capacity).toEqual(weekly);
});

test('a fresh reading after a stale one is announced even when its windows match', async () => {
    const idle = (await addClaudeConnection(seed, 'Idle plan', 'sk-ant-oat01-idle-token')).id;
    runner.send(capacity(idle, new Date(Date.now() - 7 * hour), weekly));
    await framesProcessed();
    expect(await listedCapacity(idle)).toBeNull();

    const recovered = connectionsAnnounced(seed.serverId);
    runner.send(capacity(idle, new Date(), weekly));
    await recovered;
    expect(await listedCapacity(idle)).toEqual(weekly);
});

test('a window whose reset has passed stops showing', async () => {
    const reset = (await addClaudeConnection(seed, 'Reset plan', 'sk-ant-oat01-reset-token')).id;
    const passed = { ...weekly[0], resetsAt: new Date(Date.now() - 1000).toISOString() };
    const announced = connectionsAnnounced(seed.serverId);
    runner.send(capacity(reset, new Date(), [{ ...passed, usedPercent: 100 }, weekly[1]]));
    await announced;

    expect(await listedCapacity(reset)).toEqual([weekly[1]]);
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

test('a reading taken with a replaced credential is dropped', async () => {
    const stale = [{ ...weekly[0], usedPercent: 99 }];
    runner.send(capacity(planId, new Date(), stale, 1));
    await framesProcessed();
    expect(await listedCapacity(planId)).toBeNull();

    const announced = connectionsAnnounced(seed.serverId);
    runner.send(capacity(planId, new Date(), weekly, 2));
    await announced;
    expect(await listedCapacity(planId)).toEqual(weekly);
});

function capacity(connectionId: string, readAt: Date, windows: unknown[], credentialVersion = 1) {
    return {
        connectionId,
        credentialVersion,
        readAt: readAt.toISOString(),
        type: 'runner-connection-capacity',
        windows,
    };
}

async function framesProcessed() {
    const rotationId = crypto.randomUUID();
    runner.send({
        baseVersion: 1,
        connectionId: 'mc_barrier',
        credential: { access: 'barrier', expires: 0, refresh: 'barrier' },
        previousRefresh: 'barrier',
        rotationId,
        type: 'runner-connection-credential',
    });
    await runner.next(frameOfType('runner-connection-credential-ack', { rotationId }));
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
