import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { attachmentMediaTypeSniffBytes, resolveAttachmentMediaType } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import { isVisibleGeneratedImage } from '../image-generation/image-generation-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { attachmentsTable, chatsTable } from '../postgres/schema.ts';
import { visibleChatSql } from './message-view.ts';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export class AgentAttachmentError extends Error {
    constructor(
        message: string,
        readonly code: 'ATTACHMENT_NOT_VISIBLE' | 'INVALID_ARG' | 'TARGET_NOT_FOUND'
    ) {
        super(message);
        this.name = 'AgentAttachmentError';
    }
}

export async function uploadAgentAttachment(
    db: HausDatabase,
    root: AttachmentRoot,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    input: { dataBase64: string; filename: string; mediaType?: string }
) {
    requireFilename(input.filename);
    const bytes = decodeBase64(input.dataBase64);
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new AgentAttachmentError('Attachment exceeds the 50MB limit.', 'INVALID_ARG');
    }
    const id = createOpaqueId('att');
    const attemptId = createOpaqueId('upl');
    const mediaType = resolveAttachmentMediaType({
        declared: input.mediaType,
        filename: input.filename,
        head: bytes.subarray(0, attachmentMediaTypeSniffBytes),
    });
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await db.insert(attachmentsTable).values({
        attemptId,
        byteSize: bytes.byteLength,
        filename: input.filename,
        id,
        mediaType,
        serverId: runner.serverId,
        sha256,
        stagingKey: attemptId,
        state: 'uploading',
        uploadNonce: id,
        uploaderAgentId: runner.agentId,
    });

    let stagedFile: Awaited<ReturnType<AttachmentRoot['createStagingFile']>> | null = null;
    let finalizing = false;
    try {
        stagedFile = await root.createStagingFile(runner.serverId, attemptId);
        await stagedFile.write(bytes);
        await stagedFile.sync();
        await stagedFile.close();
        stagedFile = null;
        await db
            .update(attachmentsTable)
            .set({ state: 'finalizing', updatedAt: new Date() })
            .where(
                and(eq(attachmentsTable.serverId, runner.serverId), eq(attachmentsTable.id, id))
            );
        finalizing = true;
        await root.finalize(runner.serverId, id, attemptId);
        await db
            .update(attachmentsTable)
            .set({ readyAt: new Date(), state: 'ready', updatedAt: new Date() })
            .where(
                and(eq(attachmentsTable.serverId, runner.serverId), eq(attachmentsTable.id, id))
            );
    } catch (cause) {
        await stagedFile?.close().catch(() => undefined);
        if (!finalizing) {
            await root.discardStagingFile(runner.serverId, attemptId).catch(() => undefined);
            await db
                .update(attachmentsTable)
                .set({
                    failedAt: new Date(),
                    failureCode: 'storage',
                    state: 'failed',
                    updatedAt: new Date(),
                })
                .where(
                    and(eq(attachmentsTable.serverId, runner.serverId), eq(attachmentsTable.id, id))
                );
        }
        throw cause;
    }
    return {
        attachment: {
            byteSize: bytes.byteLength,
            filename: input.filename,
            id,
            mediaType,
        },
    };
}

export async function viewAgentAttachment(
    db: HausDatabase,
    root: AttachmentRoot,
    runner: ResolvedRunner,
    attachmentId: string
) {
    const attachment = await requireVisibleAgentAttachment(db, runner, attachmentId);
    const bytes = await readAttachmentBytes(root, runner.serverId, attachment);
    return {
        attachment: {
            byteSize: attachment.byteSize,
            dataBase64: bytes.toString('base64'),
            filename: attachment.filename,
            id: attachment.id,
            mediaType: attachment.mediaType,
        },
    };
}

/**
 * The ready attachment an Agent may read: its own upload, or one on a Message
 * in a Chat it can read. Anything else is not found or not visible.
 */
export async function requireVisibleAgentAttachment(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    attachmentId: string
) {
    const [attachment] = await db
        .select()
        .from(attachmentsTable)
        .where(
            and(
                eq(attachmentsTable.serverId, runner.serverId),
                eq(attachmentsTable.id, attachmentId)
            )
        )
        .limit(1);
    if (!attachment) {
        throw new AgentAttachmentError(
            `Attachment ${attachmentId} was not found.`,
            'TARGET_NOT_FOUND'
        );
    }
    if (attachment.state !== 'ready' || attachment.byteSize === null) {
        throw new AgentAttachmentError(
            `Attachment ${attachmentId} is not visible to the caller.`,
            'ATTACHMENT_NOT_VISIBLE'
        );
    }
    const visible =
        attachment.uploaderAgentId === runner.agentId ||
        (attachment.messageId !== null &&
            attachment.chatId !== null &&
            (await canReadChat(db, runner, attachment.chatId))) ||
        (await isVisibleGeneratedImage(db, {
            attachmentId: attachment.id,
            serverId: runner.serverId,
            viewer: { agentId: runner.agentId, kind: 'agent' },
        }));
    if (!visible) {
        throw new AgentAttachmentError(
            `Attachment ${attachmentId} is not visible to the caller.`,
            'ATTACHMENT_NOT_VISIBLE'
        );
    }
    return { ...attachment, byteSize: attachment.byteSize };
}

/** The bytes of a ready attachment, checked against its recorded size. */
export async function readAttachmentBytes(
    root: AttachmentRoot,
    serverId: string,
    attachment: { byteSize: number; id: string }
) {
    const file = await root.openObject(serverId, attachment.id);
    try {
        const bytes = await file.readFile();
        if (bytes.byteLength !== attachment.byteSize) {
            throw new Error('Attachment bytes do not match their PostgreSQL metadata.');
        }
        return bytes;
    } finally {
        await file.close();
    }
}

async function canReadChat(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    chatId: string
) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, runner.serverId),
                eq(chatsTable.id, chatId),
                visibleChatSql(runner)
            )
        )
        .limit(1);
    return Boolean(chat);
}

function requireFilename(filename: string) {
    if (
        !filename.trim() ||
        filename.length > 255 ||
        basename(filename) !== filename ||
        /[\u0000-\u001f\u007f]/u.test(filename)
    ) {
        throw new AgentAttachmentError(
            'Attachment filename must not contain a path.',
            'INVALID_ARG'
        );
    }
}

function decodeBase64(value: string) {
    if (
        value.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
    ) {
        throw new AgentAttachmentError('Attachment data is not valid base64.', 'INVALID_ARG');
    }
    return Buffer.from(value, 'base64');
}
