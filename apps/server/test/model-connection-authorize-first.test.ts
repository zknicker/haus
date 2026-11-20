import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    addMember,
    type ConnectionServer,
    seedConnectionServer,
} from './model-connection.fixture.ts';

let harness: HausServerHarness;
let seed: ConnectionServer;
let member: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness({ secretsKey: null });
    seed = await seedConnectionServer(harness, 'models-authorize-first');
    member = await addMember(harness, seed, 'user_models_authorize_first_member');
});

afterAll(async () => {
    member?.close();
    seed?.owner.close();
    await harness?.close();
});

const credential = { kind: 'setup-token', token: 'sk-ant-oat01-authorize-first' } as const;

test('a member is refused before the Server looks at its secrets key', async () => {
    await expect(
        member.trpc.modelConnections.add.mutate({
            credential,
            label: 'Claude plan',
            provider: 'claude',
            serverId: seed.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    await expect(
        member.trpc.modelConnections.replaceCredential.mutate({
            connectionId: 'mcn_unknown',
            credential,
            serverId: seed.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
});

test('the Owner learns the secrets key is missing', async () => {
    await expect(
        seed.owner.trpc.modelConnections.add.mutate({
            credential,
            label: 'Claude plan',
            provider: 'claude',
            serverId: seed.serverId,
        })
    ).rejects.toMatchObject({
        data: { code: 'SERVICE_UNAVAILABLE', modelConnection: { code: 'secrets-key-missing' } },
    });
});
