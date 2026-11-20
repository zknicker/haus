import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    addMember,
    type ConnectionServer,
    connectionsAnnounced,
    seedConnectionServer,
    signInConnection,
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

test('new connections start with web search only where the provider has it', async () => {
    const claude = await addClaudeConnection(seed, 'Zach plan', 'sk-ant-oat01-search-token');
    const openrouter = await addKey('openrouter', 'OpenRouter key', 'sk-or-v1-search-key');
    const xai = await addKey('xai', 'xAI key', 'xai-search-api-key');
    const chatgpt = await signInConnection(seed, runner, {
        credential: { access: 'access-1', expires: 1, refresh: 'refresh-1' },
        label: 'ChatGPT plan',
        provider: 'chatgpt',
    });

    expect(await webSearchById()).toEqual({
        [chatgpt]: true,
        [claude.id]: false,
        [geminiId]: true,
        [openrouter.id]: true,
        [xai.id]: true,
    });

    await expect(setWebSearch(claude.id, true)).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST', modelConnection: { code: 'web-search-unsupported' } },
        message: 'Web search cannot be turned on for this provider.',
    });
    expect(await setWebSearch(claude.id, false)).toMatchObject({ webSearch: false });
    expect(await setWebSearch(openrouter.id, false)).toMatchObject({ webSearch: false });
    expect(await setWebSearch(openrouter.id, true)).toMatchObject({ webSearch: true });
});

function addKey(provider: 'openrouter' | 'xai', label: string, key: string) {
    return seed.owner.trpc.modelConnections.add.mutate({
        credential: { key, kind: 'api-key' },
        label,
        provider,
        serverId: seed.serverId,
    });
}

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
