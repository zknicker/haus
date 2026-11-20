import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addClaudeConnection,
    addMember,
    type ConnectionServer,
    createAgent,
    seedConnectionServer,
} from './model-connection.fixture.ts';
import { reportRunnerModels } from './runner.fixture.ts';

const firstToken = 'sk-ant-oat01-first-setup-token';
const xaiKey = 'xai-secret-api-key-value';
let harness: HausServerHarness;
let seed: ConnectionServer;
let other: ConnectionServer;
let member: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    await reportRunnerModels(harness);
    seed = await seedConnectionServer(harness, 'models-hq');
    other = await seedConnectionServer(harness, 'models-other');
    member = await addMember(harness, seed, 'user_models_member');
});

afterAll(async () => {
    member?.close();
    seed?.owner.close();
    other?.owner.close();
    await harness?.close();
});

describe('model connections', () => {
    test('the Owner adds connections that every member sees without a credential', async () => {
        const claude = await addClaudeConnection(seed, 'Zach plan', firstToken);
        await seed.owner.trpc.modelConnections.add.mutate({
            credential: { key: xaiKey, kind: 'api-key' },
            label: 'xAI key',
            provider: 'xai',
            serverId: seed.serverId,
        });

        expect(claude).toMatchObject({
            authKind: 'setup-token',
            isDefault: true,
            label: 'Zach plan',
            position: 0,
            provider: 'claude',
            status: 'ready',
            statusDetail: null,
            webSearch: false,
        });
        const seen = await member.trpc.modelConnections.list.query({ serverId: seed.serverId });
        expect(seen.connections.map(({ label, provider }) => ({ label, provider }))).toEqual([
            { label: 'Zach plan', provider: 'claude' },
            { label: 'xAI key', provider: 'xai' },
        ]);
        const [row] = await harness.sql`
            select sealed_credential from model_connections where id = ${claude.id}
        `;
        for (const exposed of [JSON.stringify(seen), JSON.stringify(row), JSON.stringify(claude)]) {
            expect(exposed).not.toContain(firstToken);
            expect(exposed).not.toContain(xaiKey);
        }
        expect(Object.keys(row?.sealed_credential ?? {}).toSorted()).toEqual([
            'ct',
            'iv',
            'kid',
            'tag',
            'v',
        ]);
    });

    test('a member cannot add, rename, reorder, or remove a connection', async () => {
        const [connection] = (
            await member.trpc.modelConnections.list.query({ serverId: seed.serverId })
        ).connections;
        const target = { connectionId: connection?.id ?? '', serverId: seed.serverId };

        const attempts = [
            () =>
                member.trpc.modelConnections.add.mutate({
                    credential: { kind: 'setup-token', token: 'sk-ant-oat01-member-token' },
                    label: 'Mine',
                    provider: 'claude',
                    serverId: seed.serverId,
                }),
            () => member.trpc.modelConnections.rename.mutate({ ...target, label: 'Renamed' }),
            () => member.trpc.modelConnections.makeDefault.mutate(target),
            () => member.trpc.modelConnections.remove.mutate(target),
        ];
        for (const attempt of attempts) {
            await expect(attempt()).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        }
    });

    test('a provider refuses the wrong credential kind and a taken label', async () => {
        await expect(
            seed.owner.trpc.modelConnections.add.mutate({
                credential: { key: 'gemini-shaped-key', kind: 'api-key' },
                label: 'Wrong',
                provider: 'claude',
                serverId: seed.serverId,
            })
        ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
        await expect(addClaudeConnection(seed, 'Zach plan', firstToken)).rejects.toMatchObject({
            data: { code: 'CONFLICT' },
        });
    });

    test('make default and remove renumber the provider order', async () => {
        const second = await addClaudeConnection(seed, 'Team plan', 'sk-ant-oat01-team-token');
        const third = await addClaudeConnection(seed, 'Spare plan', 'sk-ant-oat01-spare-token');

        const reordered = await seed.owner.trpc.modelConnections.makeDefault.mutate({
            connectionId: third.id,
            serverId: seed.serverId,
        });
        expect(claudeOrder(reordered.connections)).toEqual([
            ['Spare plan', 0, true],
            ['Zach plan', 1, false],
            ['Team plan', 2, false],
        ]);

        const removed = await seed.owner.trpc.modelConnections.remove.mutate({
            connectionId: third.id,
            serverId: seed.serverId,
        });
        expect(claudeOrder(removed.connections)).toEqual([
            ['Zach plan', 0, true],
            ['Team plan', 1, false],
        ]);
        const renamed = await seed.owner.trpc.modelConnections.rename.mutate({
            connectionId: second.id,
            label: 'Team Max',
            serverId: seed.serverId,
        });
        expect(renamed).toMatchObject({ id: second.id, label: 'Team Max', position: 1 });
    });

    test('an Agent takes a connection of its own provider and Server only', async () => {
        const agentId = await createAgent(seed, 'opus', 'claude');
        const { connections } = await seed.owner.trpc.modelConnections.list.query({
            serverId: seed.serverId,
        });
        const teamMax = connections.find((connection) => connection.label === 'Team Max');
        const xai = connections.find((connection) => connection.provider === 'xai');
        const foreign = await addClaudeConnection(other, 'Other plan', 'sk-ant-oat01-other-token');
        const assign = (connectionId: string | null) =>
            seed.owner.trpc.modelConnections.assignAgent.mutate({
                agentId,
                connectionId,
                serverId: seed.serverId,
            });

        await expect(assign(xai?.id ?? null)).rejects.toMatchObject({
            data: { code: 'BAD_REQUEST' },
            message: "That connection does not serve this Agent's model.",
        });
        await expect(assign(foreign.id)).rejects.toMatchObject({
            data: { code: 'BAD_REQUEST' },
            message: 'That connection is not on this Server.',
        });
        await expect(
            member.trpc.modelConnections.assignAgent.mutate({
                agentId,
                connectionId: teamMax?.id ?? null,
                serverId: seed.serverId,
            })
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

        expect(await assign(teamMax?.id ?? null)).toEqual({
            agentId,
            modelConnectionId: teamMax?.id ?? null,
        });
        expect(await agentConnection(agentId)).toBe(teamMax?.id ?? null);

        await seed.owner.trpc.modelConnections.remove.mutate({
            connectionId: teamMax?.id ?? '',
            serverId: seed.serverId,
        });
        expect(await agentConnection(agentId)).toBeNull();
    });
});

function claudeOrder(
    connections: { isDefault: boolean; label: string; position: number; provider: string }[]
) {
    return connections
        .filter((connection) => connection.provider === 'claude')
        .map((connection) => [connection.label, connection.position, connection.isDefault]);
}

async function agentConnection(agentId: string) {
    const agents = await seed.owner.trpc.agent.list.query({ serverId: seed.serverId });
    return agents.find((agent) => agent.id === agentId)?.modelConnectionId;
}
