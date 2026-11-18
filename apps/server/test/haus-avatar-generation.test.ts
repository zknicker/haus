import { afterAll, beforeAll, expect, test } from 'bun:test';
import type {
    AvatarImageProvider,
    AvatarProviderRequest,
} from '../src/avatar-generation/service.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let agentId: string;
let serverId: string;
let providerMode: 'fail' | 'success' = 'success';
const requests: AvatarProviderRequest[] = [];

const computerId = `cmp_${'h'.repeat(16)}`;
const credentialHash = 'a'.repeat(64);
const png = Uint8Array.from(
    Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    )
);

const provider: AvatarImageProvider = {
    generate: async (request) => {
        requests.push(request);
        if (providerMode === 'fail') {
            throw new Error('provider detail must not cross the API');
        }
        return { bytes: png, mediaType: 'image/png' };
    },
};

beforeAll(async () => {
    harness = await startHausServerHarness({ avatarImageProvider: provider });
    owner = await signIn('user_human_avatar_owner');
    member = await signIn('user_human_avatar_member');

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Human Avatar HQ',
        slug: 'human-avatar-generation-hq',
    });
    serverId = server.id;
    const ownerUserId = await readUserId('user_human_avatar_owner');
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'human-avatar-member-root',
    });
    const memberUserId = await readUserId('user_human_avatar_member');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_human_avatar_member', ${serverId}, ${memberUserId}, 'member')
    `;
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;

    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Scout',
        handle: 'scout',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
});

afterAll(async () => {
    owner.close();
    member.close();
    await harness.close();
});

test('human generation returns one preview without changing the ordinary avatar', async () => {
    const concept = 'a lantern-carrying fox mechanic';
    const generated = await owner.trpc.avatar.generate.mutate({ agentId, concept, serverId });

    expect(generated.avatar).toMatchObject({
        byteSize: expect.any(Number),
        height: 256,
        mediaType: 'image/png',
        width: 256,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.prompt).toContain(concept);
    expect((await owner.trpc.agent.get.query({ agentId, serverId })).avatarUrl).toBeNull();
    expect(await countAvatars()).toBe(0);
});

test('requires a short concept and Owner/Admin authority', async () => {
    await expect(
        owner.trpc.avatar.generate.mutate({ agentId, concept: '   ', serverId })
    ).rejects.toThrow();
    await expect(
        member.trpc.avatar.generate.mutate({ agentId, concept: 'a fox', serverId })
    ).rejects.toThrow(/Owner or Admin/i);
    expect(requests).toHaveLength(1);
});

test('maps provider failure to a safe error that leaves retry possible', async () => {
    providerMode = 'fail';
    await expect(
        owner.trpc.avatar.generate.mutate({ agentId, concept: 'a storm lantern', serverId })
    ).rejects.toThrow(/could not generate an avatar/i);
    expect(await countAvatars()).toBe(0);
    providerMode = 'success';
});

test('a preview saves through the ordinary avatar lifecycle', async () => {
    const generated = await owner.trpc.avatar.generate.mutate({
        agentId,
        concept: 'a copper fox mechanic',
        serverId,
    });
    const saved = await owner.trpc.avatar.set.mutate({
        bytesBase64: generated.avatar.bytesBase64,
        mediaType: generated.avatar.mediaType,
        serverId,
        target: { agentId, kind: 'agent' },
    });

    expect(saved.avatarUrl).toContain('/api/avatars/');
    expect((await owner.trpc.agent.get.query({ agentId, serverId })).avatarUrl).toBe(
        saved.avatarUrl
    );
    expect(await countAvatars()).toBe(1);

    await owner.trpc.avatar.clear.mutate({ serverId, target: { agentId, kind: 'agent' } });
    expect(await countAvatars()).toBe(0);
});

async function countAvatars() {
    const rows = (await harness.sql`select count(*)::int as count from avatars`) as {
        count: number;
    }[];
    return rows[0]?.count ?? 0;
}

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
