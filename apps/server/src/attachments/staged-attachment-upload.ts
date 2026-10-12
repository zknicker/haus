import { type AttachmentUploadResult, resolveAttachmentMediaType } from '@haus/api';
import { asError, settle } from '@haus/effect';
import { and, eq, inArray } from 'drizzle-orm';
import { Effect, Exit } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import type { ServerRuntime } from '../server-runtime.ts';
import type { AttachmentRoot } from './attachment-root.ts';
import {
    AttachmentUploadError,
    type AttachmentUploadInput,
    toAttachmentUploadMetadata,
} from './attachment-upload-model.ts';
import { streamAttachmentToFile } from './attachment-upload-stream.ts';

export async function uploadStagedAttachment(
    db: HausDatabase,
    root: AttachmentRoot,
    runtime: ServerRuntime,
    input: AttachmentUploadInput
): Promise<AttachmentUploadResult> {
    const attemptId = createOpaqueId('upl');
    const [claimed] = await db
        .update(attachmentsTable)
        .set({
            attemptId,
            byteSize: null,
            failedAt: null,
            failureCode: null,
            readyAt: null,
            sha256: null,
            stagingKey: attemptId,
            state: 'uploading',
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(attachmentsTable.serverId, input.serverId),
                eq(attachmentsTable.id, input.attachmentId),
                inArray(attachmentsTable.state, ['pending', 'failed'])
            )
        )
        .returning();

    if (!claimed) {
        throw new AttachmentUploadError(
            'That attachment upload is already in progress.',
            'conflict'
        );
    }

    const staged: StagedUpload = {
        closed: false,
        failure: undefined,
        file: null,
        finalizing: false,
    };
    return await settle(
        runtime,
        Effect.acquireUseRelease(
            Effect.succeed(staged),
            (resource) => runStagedUpload(db, root, input, attemptId, claimed, resource),
            (resource, exit) =>
                Exit.isFailure(exit)
                    ? Effect.tryPromise({
                          catch: asError,
                          try: () => cleanupFailedUpload(db, root, input, attemptId, resource),
                      }).pipe(Effect.orDie)
                    : Effect.void
        )
    );
}

interface StagedUpload {
    closed: boolean;
    failure: unknown;
    file: Awaited<ReturnType<AttachmentRoot['createStagingFile']>> | null;
    finalizing: boolean;
}

function runStagedUpload(
    db: HausDatabase,
    root: AttachmentRoot,
    input: AttachmentUploadInput,
    attemptId: string,
    claimed: Pick<typeof attachmentsTable.$inferSelect, 'filename' | 'mediaType'>,
    resource: StagedUpload
) {
    return Effect.tryPromise({
        catch: (cause) => {
            resource.failure = cause;
            return asError(cause);
        },
        try: async () => {
            resource.file = await root.createStagingFile(input.serverId, attemptId);
            const { head, sha256, sizeBytes } = await streamAttachmentToFile(
                resource.file,
                input.stream
            );
            await resource.file.sync();
            await input.failureInjection?.beforeStagedFileClose?.();
            await resource.file.close();
            resource.closed = true;
            await input.failureInjection?.afterStagingSynced?.();

            if (input.declaredLength !== null && input.declaredLength !== sizeBytes) {
                throw new AttachmentUploadError(
                    'Content-Length did not match the streamed attachment bytes.',
                    'length_mismatch'
                );
            }

            const [markedFinalizing] = await db
                .update(attachmentsTable)
                .set({
                    byteSize: sizeBytes,
                    // Browsers declare an empty type for pasted and unknown files, and
                    // the App's fallback is octet-stream: the bytes are authoritative.
                    mediaType: resolveAttachmentMediaType({
                        declared: claimed.mediaType,
                        filename: claimed.filename,
                        head,
                    }),
                    sha256,
                    state: 'finalizing',
                    updatedAt: new Date(),
                })
                .where(currentAttempt(input, attemptId, 'uploading'))
                .returning({ id: attachmentsTable.id });
            if (!markedFinalizing) {
                throw new AttachmentUploadError(
                    'The attachment upload claim was lost.',
                    'conflict'
                );
            }

            resource.finalizing = true;
            await input.failureInjection?.afterFinalizingCommit?.();
            await root.finalize(input.serverId, input.attachmentId, attemptId);
            await input.failureInjection?.afterFileFinalized?.();
            await input.failureInjection?.beforeReadyCommit?.();

            const [ready] = await db
                .update(attachmentsTable)
                .set({ readyAt: new Date(), state: 'ready', updatedAt: new Date() })
                .where(currentAttempt(input, attemptId, 'finalizing'))
                .returning();
            if (!ready) {
                throw new Error('The finalized attachment row could not be marked ready.');
            }
            return { attachment: toAttachmentUploadMetadata(ready), idempotent: false };
        },
    });
}

async function cleanupFailedUpload(
    db: HausDatabase,
    root: AttachmentRoot,
    input: AttachmentUploadInput,
    attemptId: string,
    staged: StagedUpload
) {
    const failures: unknown[] = [];
    if (staged.file && !staged.closed) {
        await staged.file.close().catch((cause: unknown) => failures.push(cause));
    }
    if (!staged.finalizing) {
        await root
            .discardStagingFile(input.serverId, attemptId)
            .catch((cause: unknown) => failures.push(cause));
        await markFailed(db, input, attemptId, failureCode(staged.failure)).catch(
            (cause: unknown) => failures.push(cause)
        );
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Attachment upload cleanup failed.');
    }
}

function currentAttempt(
    input: AttachmentUploadInput,
    attemptId: string,
    state: 'finalizing' | 'uploading'
) {
    return and(
        eq(attachmentsTable.serverId, input.serverId),
        eq(attachmentsTable.id, input.attachmentId),
        eq(attachmentsTable.attemptId, attemptId),
        eq(attachmentsTable.state, state)
    );
}

async function markFailed(
    db: HausDatabase,
    input: AttachmentUploadInput,
    attemptId: string,
    failure: string
) {
    await db
        .update(attachmentsTable)
        .set({ failedAt: new Date(), failureCode: failure, state: 'failed', updatedAt: new Date() })
        .where(currentAttempt(input, attemptId, 'uploading'));
}

function failureCode(cause: unknown) {
    return cause instanceof AttachmentUploadError ? cause.code : 'storage';
}
