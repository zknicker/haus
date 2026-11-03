import { afterAll, beforeAll, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { purgeDeletedChannels } from '../src/chats/channel-lifecycle.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let connection: HausConnection;
let owner: HausClient;
let serverId: string;
let onboardingChannelId: string;
const agentId = 'agt_delete_dependents';
const runtime = makeTestRuntime();

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('delete-dependents'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Delete Dependents',
        slug: 'delete-dependents',
    });
    serverId = server.id;
    const [onboarding] = (await harness.sql`
        select channel_id from server_onboarding where server_id = ${serverId}
    `) as Array<{ channel_id: string }>;
    onboardingChannelId = onboarding.channel_id;
    await harness.sql`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
        VALUES (${agentId}, ${serverId}, 'dependents-agent', 'Dependents Agent', 'UTC')`;
});

afterAll(async () => {
    await runtime.dispose();
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test('refuses to delete the onboarding channel and leaves it intact', async () => {
    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: onboardingChannelId,
            confirmation: 'onboarding-owner',
            serverId,
        })
    ).rejects.toThrow(/onboarding channel cannot be deleted/u);
    expect(await deletedAt(onboardingChannelId)).toEqual([{ deleted_at: null }]);
});

test('restores a pre-refusal onboarding channel tombstone instead of purging it', async () => {
    await harness.sql`
        update chats
        set deleted_at = now(),
            deleted_by_user_id = (select id from users where auth_subject = 'delete-dependents')
        where id = ${onboardingChannelId}
    `;
    const root = await openAttachmentRoot(harness.attachmentRoot, runtime);

    await purgeDeletedChannels(connection.db, root);

    expect(await deletedAt(onboardingChannelId)).toEqual([{ deleted_at: null }]);
});

test('deletes Triggers anchored in the channel aggregate with the channel', async () => {
    const channel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'automations',
        serverId,
    });
    await insertTrigger('trg_dependents_armed', channel.id, null);
    await insertTrigger('trg_dependents_tombstone', channel.id, new Date());
    await harness.sql`INSERT INTO trigger_fires
        (id, server_id, trigger_id, payload, payload_bytes, received_at)
        VALUES ('trf_dependents', ${serverId}, 'trg_dependents_armed', '', 0, now())`;

    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: channel.id,
            confirmation: 'automations',
            serverId,
        })
    ).resolves.toEqual({ chatId: channel.id, serverId });

    const remaining = (await harness.sql`
        select
            (select count(*)::int from chats where id = ${channel.id}) as chats,
            (select count(*)::int from triggers where anchor_chat_id = ${channel.id}) as triggers,
            (select count(*)::int from trigger_fires where id = 'trf_dependents') as fires
    `) as Array<{ chats: number; fires: number; triggers: number }>;
    expect(remaining).toEqual([{ chats: 0, fires: 0, triggers: 0 }]);
});

async function insertTrigger(id: string, anchorChatId: string, removedAt: Date | null) {
    await harness.sql`INSERT INTO triggers
        (id, server_id, owner_agent_id, anchor_chat_id, kind, status, title, secret_hash,
         created_at, updated_at, deleted_at)
        VALUES (${id}, ${serverId}, ${agentId}, ${anchorChatId}, 'webhook',
            ${removedAt ? 'disabled' : 'armed'}, 'Anchored trigger', 'unused', now(), now(),
            ${removedAt})`;
}

async function deletedAt(chatId: string) {
    return (await harness.sql`
        select deleted_at from chats where id = ${chatId}
    `) as Array<{ deleted_at: Date | null }>;
}
