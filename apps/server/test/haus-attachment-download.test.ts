import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let serverId: string;
let chatId: string;
let attachmentId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('download_owner'));
    outsider = createHausClient(
        harness,
        await harness.humans.mintSessionToken('download_outsider')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Download Server',
        slug: 'download-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const reservation = await owner.trpc.attachment.reserve.mutate({
        chatId,
        filename: 'résumé 2026.txt',
        mediaType: 'text/plain',
        nonce: 'download-reserve',
        serverId,
    });
    attachmentId = reservation.attachmentId;
    const uploaded = await upload(owner, serverId, attachmentId, 'download bytes');
    expect(uploaded.status).toBe(200);
    await owner.trpc.chat.send.mutate({
        attachmentIds: [attachmentId],
        chatId,
        content: 'Download this',
        nonce: 'download-message',
        serverId,
    });
});

afterAll(async () => {
    owner.close();
    outsider.close();
    await harness.close();
});

test('downloads authorized bytes with safe filename and content headers', async () => {
    const response = await download(owner, serverId, attachmentId);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('download bytes');
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('content-length')).toBe('14');
    expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="re_sume_ 2026.txt"; filename*=UTF-8''r%C3%A9sum%C3%A9%202026.txt`
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
});

test('download fails closed without membership and under foreign or path-shaped ids', async () => {
    expect((await download(outsider, serverId, attachmentId)).status).toBe(403);
    expect((await download(owner, 'srv_1234567890abcdef', attachmentId)).status).toBe(404);

    for (const candidate of ['..%2Foutside', '%2Fabsolute', '%255coutside']) {
        const response = await fetch(
            new URL(`/attachments/${serverId}/${candidate}`, harness.url),
            headers(owner)
        );
        expect(response.status).not.toBe(200);
    }
});

test('Owner inventory names every database and filesystem object without absolute paths', async () => {
    const inventory = await owner.trpc.attachment.inventory.query({ serverId });
    const attachment = inventory.attachments.find((row) => row.attachmentId === attachmentId);
    const expectedObjectKey = attachment?.expectedObjectKey;

    expect(attachment).toMatchObject({
        attachmentId,
        expectedObjectKey: expect.stringMatching(/^servers\/[a-f0-9]{64}\/objects\/[a-f0-9]{64}$/u),
        messageId: expect.any(String),
        state: 'ready',
    });
    expect(inventory.objectKeys).toContain(expectedObjectKey);
    expect(JSON.stringify(inventory)).not.toContain(harness.attachmentRoot);
    await expect(outsider.trpc.attachment.inventory.query({ serverId })).rejects.toThrow(
        /member|Owner|Admin/i
    );
});

async function upload(
    client: HausClient,
    scopedServerId: string,
    scopedAttachmentId: string,
    content: string
) {
    return await fetch(
        new URL(`/attachments/${scopedServerId}/${scopedAttachmentId}`, harness.url),
        {
            ...headers(client),
            body: new TextEncoder().encode(content),
            method: 'PUT',
        }
    );
}

async function download(client: HausClient, scopedServerId: string, scopedAttachmentId: string) {
    return await fetch(
        new URL(`/attachments/${scopedServerId}/${scopedAttachmentId}`, harness.url),
        headers(client)
    );
}

function headers(client: HausClient) {
    return {
        headers: {
            authorization: `Bearer ${client.sessionToken}`,
            'content-type': 'application/octet-stream',
            origin: harness.appOrigin,
        },
    };
}
