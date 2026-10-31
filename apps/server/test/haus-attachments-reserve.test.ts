import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_attachment_owner')
    );
    outsider = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_attachment_outsider')
    );
});

afterAll(async () => {
    owner.close();
    outsider.close();
    await harness.close();
});

test('reserves one Server-scoped attachment identity per upload nonce', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Attachment Server',
        slug: 'attachment-server',
    });
    const input = {
        chatId: server.channels[0].id,
        filename: 'quarterly report.pdf',
        mediaType: 'application/pdf',
        nonce: 'reserve-report',
        serverId: server.id,
    };

    const first = await owner.trpc.attachment.reserve.mutate(input);
    const retry = await owner.trpc.attachment.reserve.mutate(input);
    const attachmentId = String(first.attachmentId);

    expect(first).toMatchObject({
        attachmentId: expect.stringMatching(/^att_[A-Za-z0-9_-]{16}$/u),
        idempotent: false,
        maxSizeBytes: 52_428_800,
        state: 'pending',
    });
    expect(retry).toEqual({ ...first, idempotent: true });

    const rows = (await harness.sql`
        select id, server_id, chat_id, filename, media_type, state
        from attachments where id = ${attachmentId}
    `) as {
        chat_id: string;
        filename: string;
        id: string;
        media_type: string;
        server_id: string;
        state: string;
    }[];
    expect(rows).toEqual([
        {
            chat_id: input.chatId,
            filename: input.filename,
            id: first.attachmentId,
            media_type: input.mediaType,
            server_id: server.id,
            state: 'pending',
        },
    ]);

    await expect(
        owner.trpc.attachment.reserve.mutate({
            ...input,
            filename: 'different.pdf',
        })
    ).rejects.toThrow(/nonce.*different upload/i);
});

test('attachment reservations fail closed outside the authorized Server Chat', async () => {
    const server = await owner.trpc.server.bySlug.query({ slug: 'attachment-server' });

    await expect(
        outsider.trpc.attachment.reserve.mutate({
            chatId: server.channels[0].id,
            filename: 'stolen.txt',
            mediaType: 'text/plain',
            nonce: 'outsider-reserve',
            serverId: server.id,
        })
    ).rejects.toThrow(/access|member|sign in/i);

    await expect(
        owner.trpc.attachment.reserve.mutate({
            chatId: '../outside',
            filename: 'escape.txt',
            mediaType: 'text/plain',
            nonce: 'escape-reserve',
            serverId: server.id,
        })
    ).rejects.toThrow(/No Chat/i);
});
