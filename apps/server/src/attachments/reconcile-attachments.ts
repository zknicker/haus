import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import type { AttachmentRoot } from './attachment-root.ts';

export interface AttachmentRecoveryResult {
    failed: string[];
    ready: string[];
}

export async function reconcileAttachments(
    db: HausDatabase,
    root: AttachmentRoot
): Promise<AttachmentRecoveryResult> {
    const interrupted = await db
        .select()
        .from(attachmentsTable)
        .where(inArray(attachmentsTable.state, ['uploading', 'finalizing']));
    const result: AttachmentRecoveryResult = { failed: [], ready: [] };

    for (const attachment of interrupted) {
        if (attachment.state === 'uploading') {
            if (attachment.stagingKey) {
                await root.discardStagingFile(attachment.serverId, attachment.stagingKey);
            }
            await markFailed(db, attachment, 'interrupted_upload');
            result.failed.push(attachment.id);
            continue;
        }

        const recovered = await recoverFinalizing(db, root, attachment);
        result[recovered].push(attachment.id);
    }

    return result;
}

async function recoverFinalizing(
    db: HausDatabase,
    root: AttachmentRoot,
    attachment: typeof attachmentsTable.$inferSelect
): Promise<'failed' | 'ready'> {
    if (
        attachment.attemptId === null ||
        attachment.byteSize === null ||
        attachment.sha256 === null ||
        attachment.stagingKey === null
    ) {
        throw new Error(`Finalizing attachment ${attachment.id} has incomplete metadata.`);
    }

    const object = await openIfPresent(() => root.openObject(attachment.serverId, attachment.id));
    const stagingKey = attachment.stagingKey;
    const staging = await openIfPresent(() =>
        root.openStagingFile(attachment.serverId, stagingKey)
    );

    if (object && staging) {
        await Promise.all([verifyFile(object, attachment), verifyFile(staging, attachment)]);
        await root.discardStagingFile(attachment.serverId, stagingKey);
    } else if (object) {
        await verifyFile(object, attachment);
    } else if (staging) {
        await verifyFile(staging, attachment);
        await root.finalize(attachment.serverId, attachment.id, stagingKey);
    } else {
        await markFailed(db, attachment, 'missing_file');
        return 'failed';
    }

    const [ready] = await db
        .update(attachmentsTable)
        .set({ readyAt: new Date(), state: 'ready', updatedAt: new Date() })
        .where(
            and(
                eq(attachmentsTable.serverId, attachment.serverId),
                eq(attachmentsTable.id, attachment.id),
                eq(attachmentsTable.attemptId, attachment.attemptId),
                eq(attachmentsTable.state, 'finalizing')
            )
        )
        .returning({ id: attachmentsTable.id });

    if (!ready) {
        throw new Error(`Finalizing attachment ${attachment.id} changed during recovery.`);
    }
    return 'ready';
}

async function verifyFile(file: FileHandle, attachment: typeof attachmentsTable.$inferSelect) {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let sizeBytes = 0;

    try {
        while (true) {
            const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, null);
            if (bytesRead === 0) {
                break;
            }
            sizeBytes += bytesRead;
            hash.update(buffer.subarray(0, bytesRead));
        }
    } finally {
        await file.close();
    }

    if (sizeBytes !== attachment.byteSize || hash.digest('hex') !== attachment.sha256) {
        throw new Error(`Finalizing attachment ${attachment.id} bytes do not match PostgreSQL.`);
    }
}

async function openIfPresent(openFile: () => Promise<FileHandle>) {
    try {
        return await openFile();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

async function markFailed(
    db: HausDatabase,
    attachment: typeof attachmentsTable.$inferSelect,
    failureCode: string
) {
    await db
        .update(attachmentsTable)
        .set({ failedAt: new Date(), failureCode, state: 'failed', updatedAt: new Date() })
        .where(
            and(
                eq(attachmentsTable.serverId, attachment.serverId),
                eq(attachmentsTable.id, attachment.id),
                attachment.attemptId === null
                    ? isNull(attachmentsTable.attemptId)
                    : eq(attachmentsTable.attemptId, attachment.attemptId)
            )
        );
}
