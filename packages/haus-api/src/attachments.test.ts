import { expect, test } from 'bun:test';
import {
    attachmentInventorySchema,
    attachmentMetadataSchema,
    attachmentReserveInputSchema,
    attachmentUploadResultSchema,
} from './attachments.ts';

test('attachment reservations contain client intent but no storage authority', () => {
    expect(
        attachmentReserveInputSchema.parse({
            chatId: 'cht_all',
            filename: 'quarterly report.pdf',
            mediaType: 'application/pdf',
            nonce: 'upload-1',
            serverId: 'srv_main',
        })
    ).toEqual({
        chatId: 'cht_all',
        filename: 'quarterly report.pdf',
        mediaType: 'application/pdf',
        nonce: 'upload-1',
        serverId: 'srv_main',
    });

    expect(() =>
        attachmentReserveInputSchema.parse({
            chatId: 'cht_all',
            filename: 'report.pdf',
            mediaType: 'application/pdf',
            nonce: 'upload-1',
            serverId: 'srv_main',
            storagePath: '/tmp/owned-by-client',
            uploaderUserId: 'usr_intruder',
        })
    ).toThrow();
});

test('attachment metadata never includes bytes, hashes, or storage paths', () => {
    const metadata = attachmentMetadataSchema.parse({
        filename: 'empty.txt',
        id: 'att_one',
        mediaType: 'text/plain',
        sizeBytes: 0,
    });

    expect(metadata).toEqual({
        filename: 'empty.txt',
        id: 'att_one',
        mediaType: 'text/plain',
        sizeBytes: 0,
    });
    expect(() =>
        attachmentMetadataSchema.parse({
            ...metadata,
            dataBase64: '',
            sha256: 'secret',
            storagePath: '/var/db/haus/attachments/object',
        })
    ).toThrow();
});

test('streamed upload results distinguish first completion from response-loss retries', () => {
    expect(
        attachmentUploadResultSchema.parse({
            attachment: {
                filename: 'empty.txt',
                id: 'att_one',
                mediaType: 'text/plain',
                sizeBytes: 0,
            },
            idempotent: true,
        })
    ).toMatchObject({ idempotent: true });
});

test('attachment inventories expose exact relative keys but never a storage root', () => {
    const objectKey = `servers/${'a'.repeat(64)}/objects/${'b'.repeat(64)}`;
    expect(
        attachmentInventorySchema.parse({
            attachments: [
                {
                    attachmentId: 'att_one',
                    expectedObjectKey: objectKey,
                    expectedStagingKey: null,
                    messageId: 'msg_one',
                    state: 'ready',
                },
            ],
            objectKeys: [objectKey],
            serverId: 'srv_one',
            stagingKeys: [],
        })
    ).toMatchObject({ objectKeys: [objectKey] });

    expect(() =>
        attachmentInventorySchema.parse({
            attachments: [],
            objectKeys: ['/private/attachments/object'],
            serverId: 'srv_one',
            stagingKeys: [],
        })
    ).toThrow();
});
