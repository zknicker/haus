import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let client: HausClient;
let serverId: string;
let chatId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    client = createHausClient(
        harness,
        await harness.humans.mintSessionToken('attachment_message_owner')
    );
    const server = await client.trpc.server.create.mutate({
        displayName: 'Attachment Messages',
        slug: 'attachment-messages',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
});

afterAll(async () => {
    client.close();
    await harness.close();
});

test('publishes ready attachments atomically and renders only metadata in message reads', async () => {
    const attachment = await readyAttachment('rendered', 'report.txt', 'text/plain', 'report');

    const sent = await client.trpc.chat.send.mutate({
        attachmentIds: [attachment.id],
        chatId,
        content: '',
        nonce: 'attachment-only-message',
        serverId,
    });
    expect(sent).toMatchObject({
        idempotent: false,
        message: {
            attachments: [attachment],
            content: '',
        },
    });

    await expect(client.trpc.chat.messages.query({ chatId, serverId })).resolves.toMatchObject({
        messages: [{ attachments: [attachment], id: sent.message.id }],
    });
    expect(JSON.stringify(sent)).not.toContain(harness.attachmentRoot);
    expect(JSON.stringify(sent)).not.toContain('cmVwb3J0');
});

test('message retry requires the same ordered attachment association', async () => {
    const first = await readyAttachment('retry-first', 'first.txt', 'text/plain', 'first');
    const second = await readyAttachment('retry-second', 'second.txt', 'text/plain', 'second');
    const input = {
        attachmentIds: [first.id],
        chatId,
        content: 'Attached',
        nonce: 'attachment-message-retry',
        serverId,
    };

    await client.trpc.chat.send.mutate(input);
    await expect(client.trpc.chat.send.mutate(input)).resolves.toMatchObject({
        idempotent: true,
        message: { attachments: [first] },
    });
    await expect(
        client.trpc.chat.send.mutate({ ...input, attachmentIds: [second.id] })
    ).rejects.toThrow(/different send/i);
});

test('one ready attachment can win only one concurrent message association', async () => {
    const attachment = await readyAttachment('concurrent', 'one.txt', 'text/plain', 'one');
    const attempts = await Promise.allSettled([
        client.trpc.chat.send.mutate({
            attachmentIds: [attachment.id],
            chatId,
            content: 'First contender',
            nonce: 'attachment-contender-one',
            serverId,
        }),
        client.trpc.chat.send.mutate({
            attachmentIds: [attachment.id],
            chatId,
            content: 'Second contender',
            nonce: 'attachment-contender-two',
            serverId,
        }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
});

test('a Thread reply carries an attachment staged in its parent Chat', async () => {
    const anchor = await client.trpc.chat.send.mutate({
        chatId,
        content: 'Anchor',
        nonce: 'thread-attachment-anchor',
        serverId,
    });
    // The composer stages in the parent Chat because a first reply has no
    // Thread chat id yet.
    const attachment = await readyAttachment('thread-reply', 'reply.txt', 'text/plain', 'reply');

    const reply = await client.trpc.chat.send.mutate({
        attachmentIds: [attachment.id],
        chatId,
        content: 'Reply with a file',
        nonce: 'thread-attachment-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });

    const threadChatId = `cht_thr_${anchor.message.id.slice('msg_'.length)}`;
    expect(reply).toMatchObject({
        message: { attachments: [attachment], chatId: threadChatId },
        threadChatId,
    });
    await expect(
        client.trpc.chat.messages.query({ chatId: threadChatId, serverId })
    ).resolves.toMatchObject({
        messages: [{ attachments: [attachment], id: reply.message.id }],
    });

    // The attachment is re-homed to the Thread it landed in, so its download
    // authorization follows the message rather than the staging Chat.
    const attachmentId = String(attachment.id);
    const [row] = (await harness.sql`
        select chat_id from attachments where id = ${attachmentId}
    `) as { chat_id: string }[];
    expect(row.chat_id).toBe(threadChatId);
});

test('association rejects pending, foreign-Server, and already-associated ids', async () => {
    const pending = await client.trpc.attachment.reserve.mutate({
        chatId,
        filename: 'pending.txt',
        mediaType: 'text/plain',
        nonce: 'pending-association',
        serverId,
    });
    const other = await client.trpc.server.create.mutate({
        displayName: 'Foreign Attachments',
        slug: 'foreign-attachments',
    });
    const foreign = await readyAttachment(
        'foreign',
        'foreign.txt',
        'text/plain',
        'foreign',
        other.id,
        other.channels[0].id
    );

    for (const attachmentId of [pending.attachmentId, foreign.id, 'att_1234567890abcdef']) {
        await expect(
            client.trpc.chat.send.mutate({
                attachmentIds: [attachmentId],
                chatId,
                content: 'Invalid association',
                nonce: `invalid-${attachmentId}`,
                serverId,
            })
        ).rejects.toThrow(/attachment/i);
    }
});

async function readyAttachment(
    nonce: string,
    filename: string,
    mediaType: string,
    content: string,
    scopedServerId = serverId,
    scopedChatId = chatId
) {
    const reservation = await client.trpc.attachment.reserve.mutate({
        chatId: scopedChatId,
        filename,
        mediaType,
        nonce,
        serverId: scopedServerId,
    });
    const response = await fetch(
        new URL(`/attachments/${scopedServerId}/${reservation.attachmentId}`, harness.url),
        {
            body: new TextEncoder().encode(content),
            headers: {
                authorization: `Bearer ${client.sessionToken}`,
                'content-type': 'application/octet-stream',
                origin: harness.appOrigin,
            },
            method: 'PUT',
        }
    );
    expect(response.status).toBe(200);
    return (await response.json()).attachment as {
        filename: string;
        id: string;
        mediaType: string;
        sizeBytes: number;
    };
}
