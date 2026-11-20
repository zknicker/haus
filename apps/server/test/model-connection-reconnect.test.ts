import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    addMember,
    type ConnectionServer,
    createAgent,
    seedConnectionServer,
    signInConnection,
    snapshotAfter,
} from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    testRunnerToken,
} from './runner.fixture.ts';

const firstPlan = { access: 'access-1', accountId: 'acct_1', expires: 1, refresh: 'refresh-1' };
const secondPlan = { access: 'access-2', accountId: 'acct_2', expires: 2, refresh: 'refresh-2' };
let harness: HausServerHarness;
let seed: ConnectionServer;
let other: ConnectionServer;
let member: HausClient;
let runner: RunnerClient;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'models-reconnect');
    other = await seedConnectionServer(harness, 'models-reconnect-other');
    member = await addMember(harness, seed, 'user_models_reconnect_member');
    runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-model-connections'));
});

afterAll(async () => {
    runner?.close();
    member?.close();
    seed?.owner.close();
    other?.owner.close();
    await harness?.close();
});

describe('replaceCredential', () => {
    test('a new setup-token keeps the row, its place and its Agents, and makes it ready again', async () => {
        await addClaudeConnection(seed, 'Zach plan', 'sk-ant-oat01-zach-token');
        const team = await addClaudeConnection(seed, 'Team plan', 'sk-ant-oat01-team-token');
        const agentId = await createAgent(seed, 'opus-team', 'claude');
        await assign(agentId, team.id);
        await markFailed(team.id, 'Anthropic refused the setup-token.');

        const seen = runner.frames.length;
        const replaced = await seed.owner.trpc.modelConnections.replaceCredential.mutate({
            connectionId: team.id,
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-team-renewed' },
            serverId: seed.serverId,
        });

        expect(replaced).toEqual({
            authKind: 'setup-token',
            capacity: null,
            id: team.id,
            isDefault: false,
            label: 'Team plan',
            position: 1,
            provider: 'claude',
            status: 'ready',
            statusDetail: null,
            updatedAt: expect.any(String),
            webSearch: false,
        });
        expect(connectionOf(await runner.next(snapshotAfter(runner, seen)), team.id)).toEqual({
            credential: { kind: 'setup-token', token: 'sk-ant-oat01-team-renewed' },
            credentialVersion: 2,
            id: team.id,
            label: 'Team plan',
            provider: 'claude',
            serverId: seed.serverId,
            webSearch: false,
        });
        expect(await agentConnection(agentId)).toBe(team.id);
    });

    test('a new API key keeps a web search the Owner turned off', async () => {
        const key = await seed.owner.trpc.modelConnections.add.mutate({
            credential: { key: 'xai-first-api-key', kind: 'api-key' },
            label: 'xAI key',
            provider: 'xai',
            serverId: seed.serverId,
        });
        await seed.owner.trpc.modelConnections.setWebSearch.mutate({
            connectionId: key.id,
            enabled: false,
            serverId: seed.serverId,
        });

        const replaced = await seed.owner.trpc.modelConnections.replaceCredential.mutate({
            connectionId: key.id,
            credential: { key: 'xai-second-api-key', kind: 'api-key' },
            serverId: seed.serverId,
        });

        expect(replaced).toMatchObject({ id: key.id, label: 'xAI key', webSearch: false });
        expect(await credentialVersion(key.id)).toBe(2);
    });

    test('only the Owner replaces, only with the same kind, and only on this Server', async () => {
        const { connections } = await seed.owner.trpc.modelConnections.list.query({
            serverId: seed.serverId,
        });
        const claudeId = connections.find((connection) => connection.provider === 'claude')?.id;
        const foreign = await addClaudeConnection(other, 'Other plan', 'sk-ant-oat01-other');
        const replace = (
            client: HausClient,
            connectionId: string,
            kind: 'api-key' | 'setup-token'
        ) =>
            client.trpc.modelConnections.replaceCredential.mutate({
                connectionId,
                credential:
                    kind === 'api-key'
                        ? { key: 'some-api-key-value', kind }
                        : { kind, token: 'sk-ant-oat01-replacement' },
                serverId: seed.serverId,
            });

        await expect(replace(member, claudeId ?? '', 'setup-token')).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
        });
        await expect(replace(seed.owner, claudeId ?? '', 'api-key')).rejects.toMatchObject({
            data: { code: 'BAD_REQUEST' },
            message: 'This connection takes a setup-token.',
        });
        await expect(replace(seed.owner, foreign.id, 'setup-token')).rejects.toMatchObject({
            data: { code: 'NOT_FOUND' },
        });
        expect(await credentialVersion(claudeId ?? '')).toBe(1);
    });
});

describe('sign-in with replaceConnectionId', () => {
    test('the signed-in credential replaces the connection in place', async () => {
        const planId = await signInConnection(seed, runner, {
            credential: firstPlan,
            label: 'ChatGPT plan',
            provider: 'chatgpt',
        });
        const agentId = await createAgent(seed, 'sol-plan', 'codex');
        await assign(agentId, planId);
        await markFailed(planId, 'OAuth refresh failed for openai-codex: invalid_grant');

        const { signInId } = await seed.owner.trpc.modelConnections.startSignIn.mutate({
            label: 'ChatGPT plan',
            provider: 'chatgpt',
            replaceConnectionId: planId,
            serverId: seed.serverId,
        });
        await runner.next(frameOfType('runner-sign-in-start', { signInId }));
        const seen = runner.frames.length;
        runner.send({
            result: { credential: secondPlan, status: 'connected' },
            signInId,
            type: 'runner-sign-in-finished',
        });
        const snapshot = await runner.next(snapshotAfter(runner, seen));

        expect(
            await seed.owner.trpc.modelConnections.signIn.query({
                serverId: seed.serverId,
                signInId,
            })
        ).toMatchObject({ connectionId: planId, state: 'connected' });
        expect(connectionOf(snapshot, planId)).toEqual({
            credential: { credential: secondPlan, kind: 'oauth' },
            credentialVersion: 2,
            id: planId,
            label: 'ChatGPT plan',
            provider: 'chatgpt',
            serverId: seed.serverId,
            webSearch: true,
        });
        const { connections } = await seed.owner.trpc.modelConnections.list.query({
            serverId: seed.serverId,
        });
        expect(
            connections
                .filter((connection) => connection.provider === 'chatgpt')
                .map(({ id, label, position, status, statusDetail }) => ({
                    id,
                    label,
                    position,
                    status,
                    statusDetail,
                }))
        ).toEqual([
            { id: planId, label: 'ChatGPT plan', position: 0, status: 'ready', statusDetail: null },
        ]);
        expect(await agentConnection(agentId)).toBe(planId);
    });

    test('a replace target of another provider, or on another Server, is refused', async () => {
        const { connections } = await seed.owner.trpc.modelConnections.list.query({
            serverId: seed.serverId,
        });
        const idOf = (provider: string) =>
            connections.find((connection) => connection.provider === provider)?.id ?? '';
        const [foreign] = (
            await other.owner.trpc.modelConnections.list.query({ serverId: other.serverId })
        ).connections;
        const start = (provider: 'chatgpt' | 'xai', replaceConnectionId: string) =>
            seed.owner.trpc.modelConnections.startSignIn.mutate({
                label: 'Replacement',
                provider,
                replaceConnectionId,
                serverId: seed.serverId,
            });
        const refusal = {
            data: { code: 'BAD_REQUEST' },
            message: 'That connection does not sign in with this provider.',
        };

        await expect(start('chatgpt', idOf('claude'))).rejects.toMatchObject(refusal);
        await expect(start('xai', idOf('chatgpt'))).rejects.toMatchObject(refusal);
        await expect(start('xai', idOf('xai'))).rejects.toMatchObject(refusal);
        await expect(start('chatgpt', foreign?.id ?? '')).rejects.toMatchObject({
            data: { code: 'NOT_FOUND' },
        });
        expect(runner.frames.filter((frame) => frame.type === 'runner-sign-in-start')).toHaveLength(
            2
        );
    });
});

async function assign(agentId: string, connectionId: string) {
    await seed.owner.trpc.modelConnections.assignAgent.mutate({
        agentId,
        connectionId,
        serverId: seed.serverId,
    });
}

async function markFailed(connectionId: string, detail: string) {
    await harness.sql`
        update model_connections set status = 'failed', status_detail = ${detail}
        where id = ${connectionId}
    `;
}

async function credentialVersion(connectionId: string) {
    const [row] = await harness.sql`
        select credential_version from model_connections where id = ${connectionId}
    `;
    return row?.credential_version;
}

async function agentConnection(agentId: string) {
    const agents = await seed.owner.trpc.agent.list.query({ serverId: seed.serverId });
    return agents.find((agent) => agent.id === agentId)?.modelConnectionId;
}

function connectionOf(snapshot: RunnerFrame, connectionId: string) {
    return (snapshot.connections as { id: string }[]).find(
        (connection) => connection.id === connectionId
    );
}
