import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let agentId: string;

const credentialHash = 'e'.repeat(64);
const computerId = 'cmp_eeeeeeeeeeeeeeee';
const codexRuntime = {
    id: 'codex',
    label: 'Codex',
    models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
};

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.humans.mintSessionToken('user_channel_appearance');
    owner = createHausClient(harness, token);

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Appearance HQ',
        slug: 'appearance-hq',
    });
    serverId = server.id;
    const rows = (await harness.sql`
        select id from users where auth_subject = 'user_channel_appearance'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId},
            ${serverId},
            ${rows[0].id},
            ${credentialHash},
            ${{ runtimes: [codexRuntime] }}::jsonb,
            'healthy'
        )
    `;

    const agent = await owner.trpc.agent.create.mutate({
        computerId,
        description: 'Appearance agent',
        displayName: 'Iris',
        handle: 'iris',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = agent.agent.id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('a created channel keeps its appearance across list and get', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        color: 'violet',
        icon: 'RocketIcon',
        name: 'appearance-create',
        serverId,
    });
    expect(channel).toMatchObject({ color: 'violet', icon: 'RocketIcon' });

    await expect(
        owner.trpc.chat.get.query({ chatId: channel.id, serverId })
    ).resolves.toMatchObject({ color: 'violet', icon: 'RocketIcon' });

    const chats = await owner.trpc.chat.list.query({ serverId });
    expect(chats.find((chat) => chat.id === channel.id)).toMatchObject({
        color: 'violet',
        icon: 'RocketIcon',
    });
});

test('a channel created without appearance reports null for both', async () => {
    await expect(
        owner.trpc.chat.createChannel.mutate({
            agentIds: [agentId],
            name: 'appearance-default',
            serverId,
        })
    ).resolves.toMatchObject({ color: null, icon: null });
});

test('updating sets, preserves, and clears channel appearance', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'appearance-update',
        serverId,
    });

    const painted = await owner.trpc.chat.updateChannel.mutate({
        agentIds: [agentId],
        chatId: channel.id,
        color: 'amber',
        icon: 'BugIcon',
        name: 'appearance-update',
        serverId,
    });
    expect(painted).toMatchObject({ color: 'amber', icon: 'BugIcon' });

    // Omitted appearance fields leave the stored values alone.
    const renamed = await owner.trpc.chat.updateChannel.mutate({
        agentIds: [agentId],
        chatId: channel.id,
        name: 'appearance-renamed',
        serverId,
    });
    expect(renamed).toMatchObject({ color: 'amber', icon: 'BugIcon' });

    const cleared = await owner.trpc.chat.updateChannel.mutate({
        agentIds: [agentId],
        chatId: channel.id,
        color: null,
        icon: null,
        name: 'appearance-renamed',
        serverId,
    });
    expect(cleared).toMatchObject({ color: null, icon: null });
});

test('an appearance-only change emits one updated lifecycle event', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'appearance-events',
        serverId,
    });

    const beforePaint = captureAllTopics();
    await owner.trpc.chat.updateChannel.mutate({
        agentIds: [agentId],
        chatId: channel.id,
        color: 'teal',
        name: 'appearance-events',
        serverId,
    });
    await expect(publishedSince(beforePaint, serverId)).resolves.toEqual([
        expect.objectContaining({ action: 'updated', chatId: channel.id, type: 'chat.lifecycle' }),
    ]);

    const beforeRepaint = captureAllTopics();
    await owner.trpc.chat.updateChannel.mutate({
        agentIds: [agentId],
        chatId: channel.id,
        color: 'teal',
        name: 'appearance-events',
        serverId,
    });
    await expect(publishedSince(beforeRepaint, serverId)).resolves.toEqual([]);
});

test('DM chats report no channel appearance', async () => {
    await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId });
    const chats = await owner.trpc.chat.list.query({ serverId });
    expect(chats.find((chat) => chat.kind === 'dm')).toMatchObject({ color: null, icon: null });
});
