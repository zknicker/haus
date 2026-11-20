import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    type ConnectionServer,
    connectionsAnnounced,
    createAgent,
    seedConnectionServer,
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
let runner: RunnerClient;
let zachPlanId: string;
let teamPlanId: string;
const agents: Record<'chosen' | 'fallback' | 'none', string> = {
    chosen: '',
    fallback: '',
    none: '',
};

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'runner-models');
    zachPlanId = (await addClaudeConnection(seed, 'Zach plan', 'sk-ant-oat01-zach-token')).id;
    teamPlanId = (await addClaudeConnection(seed, 'Team plan', 'sk-ant-oat01-team-token')).id;
    agents.fallback = await createAgent(seed, 'opus-default', 'claude');
    agents.chosen = await createAgent(seed, 'opus-chosen', 'claude');
    agents.none = await createAgent(seed, 'sol', 'codex');
    await seed.owner.trpc.modelConnections.assignAgent.mutate({
        agentId: agents.chosen,
        connectionId: teamPlanId,
        serverId: seed.serverId,
    });
});

afterAll(async () => {
    runner?.close();
    seed?.owner.close();
    await harness?.close();
});

test('a runner attaching receives every connection opened, and a write sends a new snapshot', async () => {
    runner = connectRunner(harness, testRunnerToken);
    const snapshot = await runner.next(frameOfType('runner-model-connections'));

    expect(runner.frames.map((frame) => frame.type).slice(0, 2)).toEqual([
        'runner-hello-accepted',
        'runner-model-connections',
    ]);
    expect(snapshot.connections).toEqual([
        {
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-zach-token' },
            id: zachPlanId,
            label: 'Zach plan',
            provider: 'claude',
            serverId: seed.serverId,
            webSearch: true,
        },
        {
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-team-token' },
            id: teamPlanId,
            label: 'Team plan',
            provider: 'claude',
            serverId: seed.serverId,
            webSearch: true,
        },
    ]);

    const seen = runner.frames.length;
    await seed.owner.trpc.modelConnections.rename.mutate({
        connectionId: teamPlanId,
        label: 'Team Max',
        serverId: seed.serverId,
    });
    const next = await runner.next(snapshotAfter(seen));
    expect(labels(next)).toEqual(['Zach plan', 'Team Max']);
});

test('runner-start carries the chosen connection, else the default, else null', async () => {
    for (const [handle, agentId] of Object.entries(agents)) {
        const chatId = (
            await seed.owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId: seed.serverId })
        ).id;
        await seed.owner.trpc.chat.send.mutate({
            chatId,
            content: 'Are you there?',
            nonce: `models_dm_${handle}`,
            serverId: seed.serverId,
        });
    }
    const startOf = async (agentId: string) =>
        (
            await runner.next(
                (frame) =>
                    frame.type === 'runner-start' &&
                    (frame.start as { agentId: string }).agentId === agentId
            )
        ).modelConnectionId;

    expect(await startOf(agents.chosen)).toBe(teamPlanId);
    expect(await startOf(agents.fallback)).toBe(zachPlanId);
    expect(await startOf(agents.none)).toBeNull();
});

test('a status the runner reports shows in Settings', async () => {
    const announced = connectionsAnnounced(seed.serverId);
    runner.send({
        connectionId: teamPlanId,
        detail: 'Anthropic refused the setup-token.',
        status: 'failed',
        type: 'runner-connection-status',
    });
    await announced;

    const { connections } = await seed.owner.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    expect(connections.find((connection) => connection.id === teamPlanId)).toMatchObject({
        status: 'failed',
        statusDetail: 'Anthropic refused the setup-token.',
    });
});

function snapshotAfter(seen: number) {
    return (frame: RunnerFrame) =>
        frame.type === 'runner-model-connections' && runner.frames.indexOf(frame) >= seen;
}

function labels(frame: RunnerFrame) {
    return (frame.connections as { label: string }[]).map((connection) => connection.label);
}
