import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let ownerUserId: string;
let firstAgentId: string;
let secondAgentId: string;

const credentialHash = 'd'.repeat(64);
const computerId = 'cmp_dddddddddddddddd';
const codexRuntime = {
    id: 'codex',
    label: 'Codex',
    models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
};

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.humans.mintSessionToken('user_channel_update');
    owner = createHausClient(harness, token);

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Channel HQ',
        slug: 'channel-hq',
    });
    serverId = server.id;
    const rows = (await harness.sql`
        select id from users where auth_subject = 'user_channel_update'
    `) as { id: string }[];
    ownerUserId = rows[0].id;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId},
            ${serverId},
            ${ownerUserId},
            ${credentialHash},
            ${{ runtimes: [codexRuntime] }}::jsonb,
            'healthy'
        )
    `;

    const first = await owner.trpc.agent.create.mutate({
        computerId,
        description: 'First agent',
        displayName: 'Fen',
        handle: 'fen',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    firstAgentId = first.agent.id;
    const second = await owner.trpc.agent.create.mutate({
        computerId,
        description: 'Second agent',
        displayName: 'Juno',
        handle: 'juno',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    secondAgentId = second.agent.id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('renames a channel and replaces its Agent participants', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [firstAgentId],
        name: 'planning',
        serverId,
    });
    expect(channel.participantAgentIds).toEqual([firstAgentId]);

    const updated = await owner.trpc.chat.updateChannel.mutate({
        agentIds: [secondAgentId],
        chatId: channel.id,
        name: 'shipping',
        serverId,
    });
    expect(updated).toMatchObject({ id: channel.id, name: 'shipping' });
    expect(updated.participantAgentIds).toEqual([secondAgentId]);

    const chats = await owner.trpc.chat.list.query({ serverId });
    const reloaded = chats.find((chat) => chat.id === channel.id);
    expect(reloaded?.name).toBe('shipping');
    expect(reloaded?.participantAgentIds).toEqual([secondAgentId]);
});

test('keeping an existing Agent while adding another preserves both', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [firstAgentId],
        name: 'both-agents',
        serverId,
    });

    const updated = await owner.trpc.chat.updateChannel.mutate({
        agentIds: [firstAgentId, secondAgentId],
        chatId: channel.id,
        name: 'both-agents',
        serverId,
    });
    // Sort both sides: the server orders participants under the database
    // collation, which disagrees with JS byte order for mixed-case ids.
    expect([...updated.participantAgentIds].sort()).toEqual([firstAgentId, secondAgentId].sort());
});

test('creating and changing a channel each emit one durable lifecycle event', async () => {
    const beforeCreate = captureAllTopics();
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [firstAgentId],
        name: 'lifecycle-events',
        serverId,
    });

    await expect(publishedSince(beforeCreate, serverId)).resolves.toEqual([
        expect.objectContaining({ action: 'created', chatId: channel.id, type: 'chat.lifecycle' }),
    ]);

    const beforeRename = captureAllTopics();
    await owner.trpc.chat.updateChannel.mutate({
        agentIds: [secondAgentId],
        chatId: channel.id,
        name: 'lifecycle-events-renamed',
        serverId,
    });

    await expect(publishedSince(beforeRename, serverId)).resolves.toEqual([
        expect.objectContaining({ action: 'updated', chatId: channel.id, type: 'chat.lifecycle' }),
    ]);

    const beforeNoop = captureAllTopics();
    await owner.trpc.chat.updateChannel.mutate({
        agentIds: [secondAgentId],
        chatId: channel.id,
        name: 'lifecycle-events-renamed',
        serverId,
    });

    await expect(publishedSince(beforeNoop, serverId)).resolves.toEqual([]);
});

test('rejects Agents that do not belong to the Server', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [firstAgentId],
        name: 'guarded',
        serverId,
    });

    await expect(
        owner.trpc.chat.updateChannel.mutate({
            agentIds: ['agt_0000000000000000'],
            chatId: channel.id,
            name: 'guarded',
            serverId,
        })
    ).rejects.toThrow('Choose Agents that belong to this Server.');
});

test('rejects renaming onto an existing channel name', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [firstAgentId],
        name: 'collide-a',
        serverId,
    });
    await owner.trpc.chat.createChannel.mutate({
        agentIds: [firstAgentId],
        name: 'collide-b',
        serverId,
    });

    await expect(
        owner.trpc.chat.updateChannel.mutate({
            agentIds: [firstAgentId],
            chatId: channel.id,
            name: 'collide-b',
            serverId,
        })
    ).rejects.toThrow('A channel already uses that name.');
});

test('rejects updating a DM as if it were a channel', async () => {
    await owner.trpc.chat.ensureAgentDm.mutate({ agentId: firstAgentId, serverId });
    const chats = await owner.trpc.chat.list.query({ serverId });
    const dm = chats.find((chat) => chat.kind === 'dm');
    expect(dm).toBeDefined();

    await expect(
        owner.trpc.chat.updateChannel.mutate({
            agentIds: [firstAgentId],
            chatId: dm?.id ?? '',
            name: 'not-a-channel',
            serverId,
        })
    ).rejects.toThrow('That channel does not exist on this Server.');
});
