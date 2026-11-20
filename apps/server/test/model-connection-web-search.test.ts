import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    addMember,
    type ConnectionServer,
    connectionsAnnounced,
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
let member: HausClient;
let runner: RunnerClient;
let geminiId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'web-search');
    member = await addMember(harness, seed, 'user_web_search_member');
    const gemini = await seed.owner.trpc.modelConnections.add.mutate({
        credential: { key: 'gemini-secret-api-key', kind: 'api-key' },
        label: 'Gemini key',
        provider: 'gemini',
        serverId: seed.serverId,
    });
    geminiId = gemini.id;
    runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-model-connections'));
});

afterAll(async () => {
    runner?.close();
    member?.close();
    seed?.owner.close();
    await harness?.close();
});

test('the Owner turns web search off and on, and each change reaches the App and the runner', async () => {
    expect(await webSearchById()).toEqual({ [geminiId]: true });

    const announced = connectionsAnnounced(seed.serverId);
    let seen = runner.frames.length;
    const off = await setWebSearch(geminiId, false);
    await announced;
    expect(off).toMatchObject({ id: geminiId, provider: 'gemini', webSearch: false });
    expect(snapshotWebSearch(await runner.next(snapshotAfter(seen)))).toEqual({
        [geminiId]: false,
    });
    expect(await webSearchById()).toEqual({ [geminiId]: false });

    seen = runner.frames.length;
    expect(await setWebSearch(geminiId, true)).toMatchObject({ webSearch: true });
    expect(snapshotWebSearch(await runner.next(snapshotAfter(seen)))).toEqual({
        [geminiId]: true,
    });
});

test('a member cannot change web search', async () => {
    await expect(
        member.trpc.modelConnections.setWebSearch.mutate({
            connectionId: geminiId,
            enabled: false,
            serverId: seed.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    expect(await webSearchById()).toEqual({ [geminiId]: true });
});

test('claude and openrouter connections can turn web search off but never on', async () => {
    const claude = await addClaudeConnection(seed, 'Zach plan', 'sk-ant-oat01-search-token');
    const openrouter = await seed.owner.trpc.modelConnections.add.mutate({
        credential: { key: 'sk-or-v1-search-key', kind: 'api-key' },
        label: 'OpenRouter key',
        provider: 'openrouter',
        serverId: seed.serverId,
    });
    expect([claude.webSearch, openrouter.webSearch]).toEqual([true, true]);

    for (const connectionId of [claude.id, openrouter.id]) {
        expect(await setWebSearch(connectionId, false)).toMatchObject({ webSearch: false });
        await expect(setWebSearch(connectionId, true)).rejects.toMatchObject({
            data: { code: 'BAD_REQUEST', modelConnection: { code: 'web-search-unsupported' } },
            message: 'Web search cannot be turned on for this provider.',
        });
    }
    expect(await webSearchById()).toEqual({
        [claude.id]: false,
        [geminiId]: true,
        [openrouter.id]: false,
    });
});

function setWebSearch(connectionId: string, enabled: boolean) {
    return seed.owner.trpc.modelConnections.setWebSearch.mutate({
        connectionId,
        enabled,
        serverId: seed.serverId,
    });
}

async function webSearchById() {
    const { connections } = await seed.owner.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    return Object.fromEntries(
        connections.map((connection) => [connection.id, connection.webSearch])
    );
}

function snapshotAfter(seen: number) {
    return (frame: RunnerFrame) =>
        frame.type === 'runner-model-connections' && runner.frames.indexOf(frame) >= seen;
}

function snapshotWebSearch(frame: RunnerFrame) {
    const connections = frame.connections as { id: string; webSearch: boolean }[];
    return Object.fromEntries(
        connections.map((connection) => [connection.id, connection.webSearch])
    );
}
