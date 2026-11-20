import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    addMember,
    type ConnectionServer,
    connectionsAnnounced,
    createAgent,
    seedConnectionServer,
    snapshotAfter,
} from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    testRunnerToken,
} from './runner.fixture.ts';

let harness: HausServerHarness;
let seed: ConnectionServer;
let member: HausClient;
let runner: RunnerClient;
const ids = { spare: '', team: '', zach: '' };
const agents = { fallback: '', pinned: '' };

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'enabled');
    member = await addMember(harness, seed, 'user_enabled_member');
    ids.zach = (await addClaudeConnection(seed, 'Zach plan', 'sk-ant-oat01-zach-token')).id;
    ids.team = (await addClaudeConnection(seed, 'Team plan', 'sk-ant-oat01-team-token')).id;
    ids.spare = (await addClaudeConnection(seed, 'Spare plan', 'sk-ant-oat01-spare-token')).id;
    agents.fallback = await createAgent(seed, 'opus-default', 'claude');
    agents.pinned = await createAgent(seed, 'opus-pinned', 'claude');
    await seed.owner.trpc.modelConnections.assignAgent.mutate({
        agentId: agents.pinned,
        connectionId: ids.team,
        serverId: seed.serverId,
    });
});

afterAll(async () => {
    runner?.close();
    member?.close();
    seed?.owner.close();
    await harness?.close();
});

test('a member cannot turn a connection off', async () => {
    await expect(
        member.trpc.modelConnections.setEnabled.mutate({
            connectionId: ids.zach,
            enabled: false,
            serverId: seed.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    expect(await enabledByLabel()).toEqual({
        'Spare plan': true,
        'Team plan': true,
        'Zach plan': true,
    });
});

test('the Owner turns connections off, and Settings reads them off', async () => {
    const announced = connectionsAnnounced(seed.serverId);
    const off = await setEnabled(ids.zach, false);
    await announced;
    await setEnabled(ids.team, false);

    expect(off).toMatchObject({ enabled: false, id: ids.zach, isDefault: true });
    expect(await enabledByLabel()).toEqual({
        'Spare plan': true,
        'Team plan': false,
        'Zach plan': false,
    });
});

test('the runner snapshot leaves turned-off connections out', async () => {
    runner = connectRunner(harness, testRunnerToken);
    expect(labels(await runner.next(frameOfType('runner-model-connections')))).toEqual([
        'Spare plan',
    ]);
});

test('a run skips turned-off connections: a default falls through, and so does a pin', async () => {
    expect(await startConnection(agents.fallback)).toBe(ids.spare);
    expect(await startConnection(agents.pinned)).toBe(ids.spare);
});

test('turning a connection back on returns it to the snapshot in its place', async () => {
    const seen = runner.frames.length;
    expect(await setEnabled(ids.zach, true)).toMatchObject({ enabled: true });
    expect(labels(await runner.next(snapshotAfter(runner, seen)))).toEqual([
        'Zach plan',
        'Spare plan',
    ]);
});

function setEnabled(connectionId: string, enabled: boolean) {
    return seed.owner.trpc.modelConnections.setEnabled.mutate({
        connectionId,
        enabled,
        serverId: seed.serverId,
    });
}

async function enabledByLabel() {
    const { connections } = await member.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    return Object.fromEntries(
        connections.map((connection) => [connection.label, connection.enabled])
    );
}

async function startConnection(agentId: string) {
    const start = await runner.next(
        (frame) =>
            frame.type === 'runner-start' &&
            (frame.start as { agentId: string }).agentId === agentId
    );
    return start.modelConnectionId;
}

function labels(frame: RunnerFrame) {
    return (frame.connections as { label: string }[]).map((connection) => connection.label);
}
