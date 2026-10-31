import { afterAll, beforeAll, expect, test } from 'bun:test';
import { avatarMaxBytes } from '@haus/api/avatar';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let ownerUserId: string;
let agentId: string;

const computerId = 'cmp_avataraaaaaaaaaa';
const codexRuntime = {
    id: 'codex',
    label: 'Codex',
    models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
};

/** A real 1x1 PNG: the serve route and the signature check both read it. */
const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_avatar_owner');
    member = await signIn('user_avatar_member');

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Avatar HQ',
        slug: 'avatar-hq',
    });
    serverId = server.id;
    ownerUserId = await readUserId('user_avatar_owner');
    await member.trpc.server.create.mutate({ displayName: 'Member Root', slug: 'avatar-member' });
    const memberUserId = await readUserId('user_avatar_member');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_avatar_member', ${serverId}, ${memberUserId}, 'member')
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId},
            ${serverId},
            ${ownerUserId},
            ${'a'.repeat(64)},
            ${{ runtimes: [codexRuntime] }}::jsonb,
            'healthy'
        )
    `;

    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Cove',
        handle: 'sage',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    expect(created.agent.avatarUrl).toBeNull();
});

afterAll(async () => {
    owner.close();
    member.close();
    await harness.close();
});

test('serves an uploaded Agent avatar and drops the row it replaces', async () => {
    const stored = await owner.trpc.avatar.set.mutate({
        bytesBase64: pngBase64,
        mediaType: 'image/png',
        serverId,
        target: { agentId, kind: 'agent' },
    });

    expect(stored.avatarId).toMatch(/^avt_[a-f0-9]{16}$/u);
    expect(stored.avatarUrl).toBe(`/api/avatars/${stored.avatarId}`);
    const [listed] = await owner.trpc.agent.list.query({ serverId });
    expect(listed.avatarUrl).toBe(stored.avatarUrl);

    const served = await fetch(new URL(String(stored.avatarUrl), harness.url));
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(
        new Uint8Array(Buffer.from(pngBase64, 'base64'))
    );

    const replaced = await owner.trpc.avatar.set.mutate({
        bytesBase64: pngBase64,
        mediaType: 'image/png',
        serverId,
        target: { agentId, kind: 'agent' },
    });
    expect(replaced.avatarId).not.toBe(stored.avatarId);
    expect(await countAvatars()).toBe(1);
    expect((await fetch(new URL(String(stored.avatarUrl), harness.url))).status).toBe(404);

    const cleared = await owner.trpc.avatar.clear.mutate({
        serverId,
        target: { agentId, kind: 'agent' },
    });
    expect(cleared).toEqual({ avatarId: null, avatarUrl: null });
    expect(await countAvatars()).toBe(0);
});

test('refuses bytes that contradict the declared media type or exceed the ceiling', async () => {
    await expect(
        owner.trpc.avatar.set.mutate({
            bytesBase64: pngBase64,
            mediaType: 'image/jpeg',
            serverId,
            target: { agentId, kind: 'agent' },
        })
    ).rejects.toThrow(/not a JPEG image/i);

    await expect(
        owner.trpc.avatar.set.mutate({
            bytesBase64: Buffer.from(oversizedPng()).toString('base64'),
            mediaType: 'image/png',
            serverId,
            target: { agentId, kind: 'agent' },
        })
    ).rejects.toThrow(/512 KiB|too_big|Too big/i);

    await expect(
        owner.trpc.avatar.set.mutate({
            bytesBase64: 'not base64!!',
            mediaType: 'image/png',
            serverId,
            target: { agentId, kind: 'agent' },
        })
    ).rejects.toThrow();

    expect(await countAvatars()).toBe(0);
});

test('lets a plain member wear their own avatar but never dress an Agent', async () => {
    await expect(
        member.trpc.avatar.set.mutate({
            bytesBase64: pngBase64,
            mediaType: 'image/png',
            serverId,
            target: { agentId, kind: 'agent' },
        })
    ).rejects.toThrow(/Owner or Admin/i);

    const mine = await member.trpc.avatar.set.mutate({
        bytesBase64: pngBase64,
        mediaType: 'image/png',
        serverId,
        target: { kind: 'user' },
    });
    const directory = await owner.trpc.member.list.query({ serverId });
    const wearer = directory.members.find((entry) => entry.userId !== ownerUserId);
    expect(wearer?.avatarUrl).toBe(mine.avatarUrl);
    expect(directory.members.find((entry) => entry.userId === ownerUserId)?.avatarUrl).toBeNull();

    await member.trpc.avatar.clear.mutate({ serverId, target: { kind: 'user' } });
});

test('answers 404 for an unknown or malformed avatar id', async () => {
    expect((await fetch(new URL('/api/avatars/avt_0123456789abcdef', harness.url))).status).toBe(
        404
    );
    expect((await fetch(new URL('/api/avatars/not-an-avatar', harness.url))).status).toBe(404);
});

async function countAvatars() {
    const rows = (await harness.sql`select count(*)::int as count from avatars`) as {
        count: number;
    }[];
    return rows[0].count;
}

function oversizedPng() {
    const bytes = new Uint8Array(avatarMaxBytes + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes;
}

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return rows[0].id;
}
