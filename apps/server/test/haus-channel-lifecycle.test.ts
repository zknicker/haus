import { afterAll, beforeAll, expect, test } from 'bun:test';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let allChatId: string;
let agentId: string;
const runtime = makeTestRuntime();

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('channel-lifecycle-owner');
    member = await signIn('channel-lifecycle-member');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Lifecycle HQ',
        slug: 'lifecycle-hq',
    });
    serverId = server.id;
    allChatId = server.channels[0].id;

    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'channel-lifecycle-member-root',
    });
    const ownerUserId = await userId('channel-lifecycle-owner');
    const memberUserId = await userId('channel-lifecycle-member');
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_lifecycle_member', ${serverId}, ${memberUserId}, 'member')
    `;
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        ) values (
            'cmp_lifecycle0000000', ${serverId}, ${ownerUserId}, ${'f'.repeat(64)},
            ${{
                runtimes: [
                    {
                        id: 'codex',
                        label: 'Codex',
                        models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                    },
                ],
            }}::jsonb,
            'healthy'
        )
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId: 'cmp_lifecycle0000000',
        displayName: 'Sage',
        handle: 'sage',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
});

afterAll(async () => {
    await runtime.dispose();
    owner?.close();
    member?.close();
    await harness?.close();
});

test('archives a regular channel as preserved, searchable, frozen history', async () => {
    const channel = await createChannel('archive-me');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: '@sage durable archive fixture',
        nonce: 'archive-parent-message',
        serverId,
    });
    const reply = await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'child thread fixture',
        nonce: 'archive-thread-message',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = reply.threadChatId as string;
    const pendingAttachment = await owner.trpc.attachment.reserve.mutate({
        chatId: channel.id,
        filename: 'archive-me.txt',
        mediaType: 'text/plain',
        nonce: 'archive-attachment-reservation',
        serverId,
    });
    expect(await pendingWorkCount(channel.id)).toBeGreaterThan(0);

    const receipt = await owner.trpc.chat.archiveChannel.mutate({
        chatId: channel.id,
        serverId,
    });
    expect(receipt.archivedAt).toBeString();
    expect(await pendingWorkCount(channel.id)).toBe(0);
    expect(await pendingWorkCount(threadChatId)).toBe(0);
    expect(
        (await owner.trpc.chat.list.query({ serverId })).some(({ id }) => id === channel.id)
    ).toBe(false);
    await expect(owner.trpc.chat.listArchived.query({ serverId })).resolves.toMatchObject([
        { archivedAt: receipt.archivedAt, id: channel.id },
    ]);
    await expect(
        owner.trpc.chat.get.query({ chatId: channel.id, serverId })
    ).resolves.toMatchObject({
        archivedAt: receipt.archivedAt,
        id: channel.id,
    });
    await expect(
        owner.trpc.chat.search.query({ query: 'durable archive fixture', serverId })
    ).resolves.toMatchObject([{ chatArchivedAt: receipt.archivedAt, chatId: channel.id }]);
    await expect(send(channel.id, 'archived parent')).rejects.toThrow(/archived/u);
    const rejectedUpload = await fetch(
        new URL(`/attachments/${serverId}/${pendingAttachment.attachmentId}`, harness.url),
        {
            body: 'too late',
            headers: {
                authorization: `Bearer ${owner.sessionToken}`,
                'content-type': 'application/octet-stream',
            },
            method: 'PUT',
        }
    );
    expect(rejectedUpload.status).toBe(409);
    await expect(rejectedUpload.json()).resolves.toMatchObject({
        error: expect.stringMatching(/archived/u),
    });
    await expect(
        owner.trpc.attachment.reserve.mutate({
            chatId: threadChatId,
            filename: 'archived.txt',
            mediaType: 'text/plain',
            nonce: crypto.randomUUID(),
            serverId,
        })
    ).rejects.toThrow(/archived/u);

    await owner.trpc.chat.unarchiveChannel.mutate({ chatId: channel.id, serverId });
    await expect(send(channel.id, 'restored channel')).resolves.toMatchObject({
        message: { content: 'restored channel' },
    });
});

test('limits lifecycle authority and excludes #all', async () => {
    const channel = await createChannel('guarded-lifecycle');
    await expect(
        member.trpc.chat.archiveChannel.mutate({ chatId: channel.id, serverId })
    ).rejects.toThrow(/Owner or Admin/u);
    await expect(
        owner.trpc.chat.archiveChannel.mutate({ chatId: allChatId, serverId })
    ).rejects.toThrow(/#all/u);
});

test('deletes the channel aggregate and announces its deletion', async () => {
    const realtime = captureAllTopics();
    const channel = await createChannel('delete-me');
    const reservation = await owner.trpc.attachment.reserve.mutate({
        chatId: channel.id,
        filename: 'delete-me.txt',
        mediaType: 'text/plain',
        nonce: 'delete-attachment-reservation',
        serverId,
    });
    const upload = await fetch(
        new URL(`/attachments/${serverId}/${reservation.attachmentId}`, harness.url),
        {
            body: 'delete these bytes',
            headers: {
                authorization: `Bearer ${owner.sessionToken}`,
                'content-type': 'application/octet-stream',
            },
            method: 'PUT',
        }
    );
    expect(upload.status).toBe(200);
    const root = await openAttachmentRoot(harness.attachmentRoot, runtime);
    const objectPath = join(root.path, root.objectKey(serverId, reservation.attachmentId));
    await expect(lstat(objectPath)).resolves.toBeDefined();
    const sent = await owner.trpc.chat.send.mutate({
        attachmentIds: [reservation.attachmentId],
        chatId: channel.id,
        content: 'erase this aggregate',
        nonce: 'delete-parent-message',
        serverId,
    });
    await owner.trpc.chat.send.mutate({
        chatId: channel.id,
        content: 'erase this child thread',
        nonce: 'delete-thread-message',
        serverId,
        thread: { anchorMessageId: sent.message.id },
    });
    await expect(
        owner.trpc.chat.deleteChannel.mutate({
            chatId: channel.id,
            confirmation: 'wrong',
            serverId,
        })
    ).rejects.toThrow(/exactly/u);

    await owner.trpc.chat.deleteChannel.mutate({
        chatId: channel.id,
        confirmation: 'delete-me',
        serverId,
    });
    await expect(owner.trpc.chat.get.query({ chatId: channel.id, serverId })).rejects.toThrow();
    await expect(lstat(objectPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
        owner.trpc.chat.search.query({ query: 'erase this aggregate', serverId })
    ).resolves.toEqual([]);
    const remaining = (await harness.sql`
        select
            (select count(*)::int from chats
                where id = ${channel.id} or parent_chat_id = ${channel.id}) as chats,
            (select count(*)::int from chat_messages
                where chat_id = ${channel.id}) as messages
    `) as Array<{ chats: number; messages: number }>;
    expect(remaining).toEqual([{ chats: 0, messages: 0 }]);
    const events = await publishedSince(realtime, serverId);
    realtime.stop();
    expect(events).toContainEqual(
        expect.objectContaining({ action: 'deleted', chatId: channel.id, type: 'chat.lifecycle' })
    );
});

async function createChannel(name: string) {
    return await owner.trpc.chat.createChannel.mutate({ agentIds: [agentId], name, serverId });
}

async function pendingWorkCount(chatId: string) {
    const [row] = (await harness.sql`
        select count(*)::int as count from agent_inbox
        where server_id = ${serverId} and chat_id = ${chatId} and run_id is null
    `) as Array<{ count: number }>;
    return row.count;
}

async function send(chatId: string, content: string) {
    return await owner.trpc.chat.send.mutate({
        chatId,
        content,
        nonce: crypto.randomUUID(),
        serverId,
    });
}

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}

async function userId(subject: string) {
    const [row] = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as Array<{ id: string }>;
    return row.id;
}
