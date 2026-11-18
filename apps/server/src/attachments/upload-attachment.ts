import type { AttachmentUploadResult } from '@haus/api';
import { asError, settle } from '@haus/effect';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import type { ServerRuntime } from '../server-runtime.ts';
import type { AttachmentRoot } from './attachment-root.ts';
import {
    AttachmentUploadError,
    type AttachmentUploadInput,
    toAttachmentUploadMetadata,
} from './attachment-upload-model.ts';
import { digestAttachmentStream } from './attachment-upload-stream.ts';
import { uploadStagedAttachment } from './staged-attachment-upload.ts';

export type { AttachmentUploadFailureInjection } from './attachment-upload-model.ts';
export { AttachmentUploadError } from './attachment-upload-model.ts';

export async function uploadAttachment(
    db: HausDatabase,
    root: AttachmentRoot,
    runtime: ServerRuntime,
    input: AttachmentUploadInput
): Promise<AttachmentUploadResult> {
    return await settle(
        runtime,
        Effect.acquireUseRelease(
            Effect.sync(() => root.beginServerWrite(input.serverId)),
            () =>
                Effect.tryPromise({
                    catch: asError,
                    try: () => uploadAttachmentOperation(db, root, runtime, input),
                }),
            (release) => Effect.sync(release)
        )
    );
}

async function uploadAttachmentOperation(
    db: HausDatabase,
    root: AttachmentRoot,
    runtime: ServerRuntime,
    input: AttachmentUploadInput
): Promise<AttachmentUploadResult> {
    const attachment = await findAttachment(db, input.serverId, input.attachmentId);
    if (!attachment) {
        throw new AttachmentUploadError('No attachment was found in that Server.', 'not_found');
    }
    if (!attachment.chatId) {
        throw new AttachmentUploadError('That attachment is not a human upload.', 'forbidden');
    }

    await requireChatWriteAccess(db, input.member, {
        chatId: attachment.chatId,
        serverId: input.serverId,
    });
    if (!input.member || attachment.uploaderUserId !== input.member.id) {
        throw new AttachmentUploadError(
            'Only the attachment uploader can upload its bytes.',
            'forbidden'
        );
    }

    if (attachment.state !== 'ready') {
        return await uploadStagedAttachment(db, root, runtime, input);
    }

    const incoming = await digestAttachmentStream(input.stream);
    if (input.declaredLength !== null && input.declaredLength !== incoming.sizeBytes) {
        throw new AttachmentUploadError(
            'Content-Length did not match the streamed attachment bytes.',
            'length_mismatch'
        );
    }
    if (attachment.byteSize !== incoming.sizeBytes || attachment.sha256 !== incoming.sha256) {
        throw new AttachmentUploadError(
            'That attachment id is already ready with different bytes.',
            'conflict'
        );
    }
    return { attachment: toAttachmentUploadMetadata(attachment), idempotent: true };
}

async function findAttachment(db: HausDatabase, serverId: string, attachmentId: string) {
    const [attachment] = await db
        .select()
        .from(attachmentsTable)
        .where(and(eq(attachmentsTable.serverId, serverId), eq(attachmentsTable.id, attachmentId)))
        .limit(1);
    return attachment;
}
